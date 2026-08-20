import { describe, expect, it } from 'vitest'
import { parseAppleList } from '../../src/engine/drivers/apple-container.js'

// Captured verbatim from `container list --format json --all` on container CLI 1.0.0.
const REAL_OUTPUT = JSON.stringify([
  {
    id: 'buildkit',
    status: { networks: [], state: 'stopped' },
    configuration: {
      id: 'buildkit',
      labels: { 'com.apple.container.plugin': 'builder' },
      image: { reference: 'ghcr.io/apple/container-builder-shim/builder:0.12.0' },
    },
  },
  {
    id: 'dcw-demo',
    status: { networks: [{ ipv4Address: '192.168.64.2/24' }], startedDate: '2026-08-20T16:42:28Z', state: 'running' },
    configuration: {
      id: 'dcw-demo',
      labels: { 'dcw.env': 'demo' },
      image: { reference: 'docker.io/library/alpine:latest' },
    },
  },
])

describe('parseAppleList — Apple Containers uses a nested schema, not docker’s flat one', () => {
  it('reads name, status and image out of the nested shape', () => {
    const rows = parseAppleList(REAL_OUTPUT)
    const demo = rows.find((r) => r.id === 'dcw-demo')!
    // Reading docker's field names off this gave name:'' and status:'[object Object]',
    // which made `dcw ls` call a running container "absent".
    expect(demo.name).toBe('dcw-demo')
    expect(demo.status).toBe('running')
    expect(demo.image).toBe('docker.io/library/alpine:latest')
    expect(demo.labels['dcw.env']).toBe('demo')
  })

  it('applies the label filter client-side (container list has no --filter)', () => {
    // Without this, every env matched the unrelated always-present `buildkit`
    // container, defeating the presence guard in stop/rm.
    const rows = parseAppleList(REAL_OUTPUT, 'dcw.env=demo')
    expect(rows.map((r) => r.id)).toEqual(['dcw-demo'])
  })

  it('returns nothing for a label that matches no container', () => {
    expect(parseAppleList(REAL_OUTPUT, 'dcw.env=missing')).toEqual([])
  })

  it('is recognised as running by the real attach liveness check', async () => {
    const { isContainerRunning } = await import('../../src/core/ssh/attach.js')
    const rows = parseAppleList(REAL_OUTPUT, 'dcw.env=demo')
    // Drive the actual helper rather than re-asserting its regex here.
    const driver = { ps: async () => rows } as unknown as Parameters<typeof isContainerRunning>[0]
    expect(await isContainerRunning(driver, 'demo')).toBe(true)

    const stopped = parseAppleList(REAL_OUTPUT, 'com.apple.container.plugin=builder')
    const stoppedDriver = { ps: async () => stopped } as unknown as Parameters<typeof isContainerRunning>[0]
    expect(await isContainerRunning(stoppedDriver, 'buildkit')).toBe(false)
  })

  it('skips a malformed row instead of taking down ls/stop/rm', () => {
    // One bad row in otherwise-valid JSON used to throw on `row.configuration`.
    const withNull = '[null, ' + REAL_OUTPUT.slice(1)
    const rows = parseAppleList(withNull)
    expect(rows.map((r) => r.id)).toContain('dcw-demo')
    expect(parseAppleList('[null]')).toEqual([])
    expect(parseAppleList('[1, "x", null]')).toEqual([])
  })

  it('degrades to an empty list on malformed output', () => {
    expect(parseAppleList('not json')).toEqual([])
    expect(parseAppleList('{}')).toEqual([])
  })
})
