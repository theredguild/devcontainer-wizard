import { describe, expect, it } from 'vitest'
import { renderHook } from './render-hook.js'
import { useStepNav } from '../../src/wizard/hooks/useStepNav.js'

describe('useStepNav', () => {
  it('starts at the first step', () => {
    const nav = renderHook(() => useStepNav(3))
    expect(nav.current.index).toBe(0)
    expect(nav.current.atStart).toBe(true)
  })

  it('advances forward and reports that it is no longer at the start', async () => {
    const nav = renderHook(() => useStepNav(3))
    await nav.act(() => nav.current.next())
    expect(nav.current.index).toBe(1)
    expect(nav.current.atStart).toBe(false)
  })

  it('clamps at the last step instead of running past the end', async () => {
    const nav = renderHook(() => useStepNav(2))
    await nav.act(() => nav.current.next())
    await nav.act(() => nav.current.next())
    expect(nav.current.index).toBe(1)
  })

  it('clamps at the first step instead of going negative', async () => {
    const nav = renderHook(() => useStepNav(3))
    await nav.act(() => nav.current.back())
    expect(nav.current.index).toBe(0)
  })

  it('walks back down the steps it walked up', async () => {
    const nav = renderHook(() => useStepNav(4))
    await nav.act(() => nav.current.next())
    await nav.act(() => nav.current.next())
    await nav.act(() => nav.current.back())
    expect(nav.current.index).toBe(1)
  })
})
