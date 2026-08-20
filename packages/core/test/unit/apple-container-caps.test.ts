import { describe, expect, it } from 'vitest'
import { planEnvironment } from '../../src/core/plan.js'
import { AppleContainerDriver } from '../../src/engine/drivers/apple-container.js'
import { enforceStrict, translate } from '../../src/hardening/translator.js'
import { EnvSpecSchema } from '../../src/spec/env-spec.js'

const appleCaps = new AppleContainerDriver().capabilities

function applied(hardening: string[]) {
  const plan = planEnvironment(EnvSpecSchema.parse({ name: 'demo', hardening }))
  return translate(plan.effects, appleCaps, 'apple-container')
}

// NOTE: these assert dcw's declared stance toward Apple Containers, not the engine's
// behaviour — a unit test cannot observe the runtime. The stance itself was set from
// live probes against `container` CLI 1.0.0, recorded in apple-container.ts.
describe('Apple Containers capability stance', () => {
  it('emits --cap-drop rather than discarding it', () => {
    // Live probe: `--cap-drop ALL` takes CapEff from 00000000a80425fb to
    // 0000000000000000, so declaring it unsupported threw away real hardening.
    const t = applied(['drop-caps'])
    expect(t.flags).toContain('--cap-drop=ALL')
    expect(t.dropped.map((e) => e.kind)).not.toContain('drop-cap')
  })

  it('drops the controls the VM runtime genuinely lacks', () => {
    const kinds = applied(['network-none', 'no-new-privs', 'apparmor']).dropped.map((e) => e.kind)
    expect(kinds).toEqual(expect.arrayContaining(['network-none', 'no-new-privs', 'apparmor']))
  })

  it('drops tmpfs instead of emitting a lossy bare path', () => {
    // `container run --tmpfs <s>` treats the WHOLE string as the mount path, so the
    // Docker form mounts a directory literally named "/tmp:rw,noexec,...". Emitting
    // a bare path instead would silently discard uid=1000/gid=1000/mode=0700, giving
    // root-owned empty tmpfs over /home/vscode/.local and .ssh — hiding baked tools
    // and breaking `dcw attach`. Dropping it (loudly) is the safe stance.
    const t = applied(['secure-tmp'])
    expect(t.flags).toEqual([])
    expect(t.dropped.map((e) => e.kind)).toContain('tmpfs')
  })

  it('drops read-only rootfs, which is unusable without those tmpfs mounts', () => {
    const t = applied(['readonly-os'])
    expect(t.flags).not.toContain('--read-only')
    expect(t.dropped.map((e) => e.kind)).toContain('readonly-rootfs')
  })

  it('fails --strict for anything it had to drop', () => {
    expect(() => enforceStrict(applied(['readonly-os']))).toThrow(/cannot honor/)
    expect(() => enforceStrict(applied(['network-none']))).toThrow(/cannot honor/)
    // cap-drop alone is fully honored, so strict succeeds.
    expect(() => enforceStrict(applied(['drop-caps']))).not.toThrow()
  })
})
