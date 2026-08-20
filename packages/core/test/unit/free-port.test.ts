import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'

interface FakeServer extends EventEmitter {
  listen: (port: number, host: string, cb: () => void) => void
  address: () => unknown
  close: (cb: () => void) => void
}

let addressResult: unknown = { port: 4321 }
let listenError: Error | undefined

vi.mock('node:net', () => ({
  createServer: (): FakeServer => {
    const srv = new EventEmitter() as FakeServer
    srv.listen = (_port, _host, cb) => {
      if (listenError) {
        srv.emit('error', listenError)
        return
      }
      cb()
    }
    srv.address = () => addressResult
    srv.close = (cb: () => void) => cb()
    return srv
  },
}))

const { findFreePort } = await import('../../src/core/ssh/attach.js')

describe('findFreePort failure modes', () => {
  it('reads the port back off the bound loopback socket', async () => {
    addressResult = { port: 4321 }
    listenError = undefined
    expect(await findFreePort()).toBe(4321)
  })

  it('rejects rather than guessing when the socket reports no numeric address', async () => {
    addressResult = '/tmp/some.sock'
    listenError = undefined
    await expect(findFreePort()).rejects.toThrow('Could not determine a free port.')
  })

  it('rejects when the socket cannot be bound at all', async () => {
    addressResult = { port: 1 }
    listenError = new Error('EADDRINUSE')
    await expect(findFreePort()).rejects.toThrow('EADDRINUSE')
  })
})
