import type { ToolKey } from '../domain/install-commands.js'

/**
 * Compatibility shims installed immediately before a tool whose upstream binary
 * needs something modern Debian no longer ships. Each shim is a RUN-only snippet
 * and is wrapped by the same best-effort guard as the tool it precedes.
 */

// ityfuzz's prebuilt binary links against OpenSSL 1.1 (libssl.so.1.1), dropped
// in Debian 12+. Pull the last bullseye build from the Debian pool over HTTPS and
// verify it against the SHA-256 recorded in Debian's signed bullseye Packages
// index before handing it to dpkg (which runs maintainer scripts as root).
export const LIBSSL11_VERSION = '1.1.1w-0+deb11u1'
export const LIBSSL11_SHA256: Readonly<Record<string, string>> = {
  amd64: 'aadf8b4b197335645b230c2839b4517aa444fd2e8f434e5438c48a18857988f7',
  arm64: 'fe7a7d313c87e46e62e614a07137e4a476a79fc9e5aab7b23e8235211280fee3',
}

const LIBSSL11_SHIM = `
# Compatibility: install libssl1.1 (OpenSSL 1.1) for tools not yet built against OpenSSL 3.
# Sourced from the Debian bullseye (oldstable) main pool over HTTPS; the digest is pinned
# to the value published in Debian's signed bullseye Packages index.
RUN ARCH="$(dpkg --print-architecture)" && \
    case "$ARCH" in \
      amd64) SHA256="${LIBSSL11_SHA256.amd64}" ;; \
      arm64) SHA256="${LIBSSL11_SHA256.arm64}" ;; \
      *) echo "libssl1.1 shim: unsupported architecture $ARCH" >&2; exit 1 ;; \
    esac && \
    curl -fsSL --proto '=https' --tlsv1.2 -o /tmp/libssl1.1.deb \
      "https://deb.debian.org/debian/pool/main/o/openssl/libssl1.1_${LIBSSL11_VERSION}_\${ARCH}.deb" && \
    echo "$SHA256  /tmp/libssl1.1.deb" | sha256sum -c - && \
    sudo dpkg -i /tmp/libssl1.1.deb && \
    rm -f /tmp/libssl1.1.deb
`

export const PRE_INSTALL_SHIMS: Partial<Record<ToolKey, string>> = {
  ityfuzz: LIBSSL11_SHIM,
}
