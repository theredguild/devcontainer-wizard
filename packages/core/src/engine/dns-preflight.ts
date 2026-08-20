import { capture } from './exec.js'

/**
 * Diagnosis for the single worst failure mode on Apple Containers: a build whose
 * `RUN apt-get update` dies with `Temporary failure resolving 'deb.debian.org'`.
 *
 * Why this needs its own diagnosis instead of "just pass --dns":
 *
 *  - `container build` does NOT execute in an ephemeral network namespace the way
 *    `docker build` does. Every build step runs inside the long-lived, shared
 *    `buildkit` container, so the build resolves through THAT container's
 *    /etc/resolv.conf. `container build --dns <ip>` is accepted by the argument
 *    parser and then has no effect — verified against `container` CLI 1.0.0.
 *    Emitting it would be exactly the "flag that does nothing" this codebase
 *    refuses to emit elsewhere (see the capability notes in apple-container.ts).
 *  - The builder's resolvers are fixed at `container builder start` time, and
 *    default to the container network's gateway (192.168.64.1).
 *  - Nothing in dcw's process can serve DNS on that gateway. Apple's gateway
 *    resolver binds port 53 on the IPv4 wildcard, so ANY host process that already
 *    holds :53 on a specific IPv4 address (Cloudflare WARP's local DoH proxy on
 *    127.0.2.2/127.0.2.3, dnsmasq, Tailscale, zScaler, …) makes that bind fail and
 *    silently leaves the gateway with no resolver at all — apple/container#402.
 *
 * So dcw cannot fix this; it can only stop hiding it. The probe runs ONLY after a
 * build has already failed (zero cost on the happy path, and no chance of a false
 * positive stopping a healthy build), and it fails open: anything unparseable or
 * unexpected yields `null` so the caller re-throws the real build error.
 */

/** A host socket bound to port 53, as reported by `netstat -an -p udp`. */
export interface Port53Listener {
  family: 'inet' | 'inet6'
  /** Bound address, or '*' for the wildcard. */
  address: string
}

/**
 * Parse `netstat -an -p udp` output down to the port-53 bindings.
 *
 * macOS rows are `proto Recv-Q Send-Q  Local-Address  Foreign-Address`, with the
 * local address written as `<addr>.<port>` (`*.53`, `127.0.2.2.53`,
 * `fe80::1%lo0.53`) — hence the split on the LAST dot, not the first.
 */
export function parsePort53Listeners(netstatOutput: string): Port53Listener[] {
  const out: Port53Listener[] = []
  for (const line of netstatOutput.split('\n')) {
    const cols = line.trim().split(/\s+/)
    const proto = cols[0]
    const local = cols[3]
    if (!local) continue
    if (proto !== 'udp4' && proto !== 'udp6') continue
    const dot = local.lastIndexOf('.')
    if (dot < 0) continue
    if (local.slice(dot + 1) !== '53') continue
    out.push({ family: proto === 'udp4' ? 'inet' : 'inet6', address: local.slice(0, dot) })
  }
  return out
}

const WILDCARD_ADDRS = new Set(['*', '0.0.0.0'])

/**
 * True when no host socket can be answering DNS at the container gateway.
 *
 * IPv4 only: the guest's resolv.conf carries the IPv4 gateway, so an IPv6
 * wildcard bind (which succeeds even when the IPv4 one is refused — the usual
 * shape of this bug) proves nothing.
 */
export function gatewayDnsUnavailable(listeners: Port53Listener[], gatewayIpv4: string): boolean {
  return !listeners.some(
    (l) => l.family === 'inet' && (WILDCARD_ADDRS.has(l.address) || l.address === gatewayIpv4),
  )
}

/** IPv4 port-53 binders that are not the gateway — the processes that block the wildcard bind. */
export function conflictingPort53Binders(listeners: Port53Listener[], gatewayIpv4: string): string[] {
  const seen = new Set<string>()
  for (const l of listeners) {
    if (l.family !== 'inet') continue
    if (WILDCARD_ADDRS.has(l.address) || l.address === gatewayIpv4) continue
    seen.add(`${l.address}:53`)
  }
  return [...seen]
}

export interface AppleDnsProbe {
  /** Explicit resolvers the `buildkit` container was started with (empty = inherit the gateway). */
  builderNameservers: string[]
  gatewayIpv4: string
  listeners: Port53Listener[]
}

export interface AppleDnsDiagnosis {
  /** True when the builder resolves through a gateway that nothing is serving. */
  blocked: boolean
  gatewayIpv4: string
  /** Other IPv4 sockets holding port 53, which is why the gateway resolver could not bind. */
  conflicting: string[]
}

/**
 * Decide whether a failed Apple Containers build was starved of DNS.
 *
 * Blocked requires BOTH halves: the builder has no resolver of its own (or was
 * pointed straight at the gateway), AND nothing is serving DNS on that gateway.
 * A builder started with `--dns 1.1.1.1` is never reported as blocked, so a
 * genuine compile error in a Containerfile still surfaces as itself.
 */
export function diagnoseAppleBuildDns(probe: AppleDnsProbe): AppleDnsDiagnosis {
  const usesGateway =
    probe.builderNameservers.length === 0 || probe.builderNameservers.includes(probe.gatewayIpv4)
  return {
    blocked: usesGateway && gatewayDnsUnavailable(probe.listeners, probe.gatewayIpv4),
    gatewayIpv4: probe.gatewayIpv4,
    conflicting: conflictingPort53Binders(probe.listeners, probe.gatewayIpv4),
  }
}

/** Public resolvers suggested in the remediation (same pair `secure-dns` uses). */
const SUGGESTED_RESOLVERS = ['1.1.1.1', '1.0.0.1']

/** The actionable error text. Keep the exact commands copy-pasteable. */
export function appleBuildDnsMessage(diag: AppleDnsDiagnosis): string {
  const conflict =
    diag.conflicting.length > 0
      ? ` Something else on this host already holds port 53 (${diag.conflicting.join(', ')}) — ` +
        'a local DNS proxy such as Cloudflare WARP, dnsmasq, Tailscale or zScaler — which stops ' +
        "Apple's gateway resolver from binding (apple/container#402)."
      : ' No host process is bound to port 53 for the container network.'
  const dnsArgs = SUGGESTED_RESOLVERS.map((s) => `--dns ${s}`).join(' ')
  return (
    'Apple Containers build failed and the builder has no working DNS.\n' +
    `Build steps run inside the shared \`buildkit\` container, which resolves through the container ` +
    `network gateway ${diag.gatewayIpv4}.${conflict}\n` +
    '`container build --dns` is accepted but ignored — the builder\'s resolvers are fixed when it ' +
    'starts. Point the builder at public resolvers instead, then rebuild:\n' +
    '    container builder stop\n' +
    `    container builder start ${dnsArgs}`
  )
}

/** Read `configuration.dns.nameservers` out of `container inspect <id>` JSON. */
export function parseBuilderNameservers(stdout: string): string[] | null {
  let rows: unknown
  try {
    rows = JSON.parse(stdout)
  } catch {
    return null
  }
  if (!Array.isArray(rows) || rows.length === 0) return null
  const cfg = ((rows[0] as Record<string, unknown>).configuration ?? {}) as Record<string, unknown>
  const dns = cfg.dns
  if (dns === null || dns === undefined) return []
  if (typeof dns !== 'object') return null
  const servers = (dns as Record<string, unknown>).nameservers
  if (servers === null || servers === undefined) return []
  if (!Array.isArray(servers)) return null
  return servers.map((s) => String(s))
}

/** Read `status.ipv4Gateway` out of `container network inspect <name>` JSON. */
export function parseNetworkGateway(stdout: string): string | null {
  let rows: unknown
  try {
    rows = JSON.parse(stdout)
  } catch {
    return null
  }
  if (!Array.isArray(rows) || rows.length === 0) return null
  const status = ((rows[0] as Record<string, unknown>).status ?? {}) as Record<string, unknown>
  const gw = status.ipv4Gateway
  return typeof gw === 'string' && gw.length > 0 ? gw : null
}

/**
 * Probe the host + builder read-only. Returns `null` whenever the picture is
 * incomplete — the caller must then re-throw the original build error rather
 * than blame DNS for something it cannot prove.
 */
export async function probeAppleBuildDns(bin = 'container'): Promise<AppleDnsDiagnosis | null> {
  const [inspect, network, netstat] = await Promise.all([
    capture(bin, ['inspect', 'buildkit']),
    capture(bin, ['network', 'inspect', 'default']),
    capture('netstat', ['-an', '-p', 'udp']),
  ])
  if (inspect.code !== 0 || network.code !== 0 || netstat.code !== 0) return null

  const builderNameservers = parseBuilderNameservers(inspect.stdout)
  const gatewayIpv4 = parseNetworkGateway(network.stdout)
  if (builderNameservers === null || gatewayIpv4 === null) return null

  const listeners = parsePort53Listeners(netstat.stdout)
  // An empty parse means netstat printed something we do not understand; treating
  // that as "nothing is listening" would accuse a healthy host.
  if (listeners.length === 0) return null

  return diagnoseAppleBuildDns({ builderNameservers, gatewayIpv4, listeners })
}
