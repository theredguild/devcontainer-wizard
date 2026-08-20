import { render } from 'ink-testing-library'
import { createElement } from 'react'

/**
 * Minimal hook harness: render a component that only calls the hook and records
 * its return value, so hooks can be driven without a UI around them.
 */
export function renderHook<T>(hook: () => T): { current: T; act: (fn: () => void) => Promise<void> } {
  const box = {
    current: undefined as unknown as T,
    act: async (_fn: () => void): Promise<void> => {},
  }
  function Probe() {
    box.current = hook()
    return null
  }
  render(createElement(Probe))
  box.act = async (fn: () => void) => {
    fn()
    // Let React flush the state update into a re-render.
    await new Promise((r) => setTimeout(r, 20))
  }
  return box as { current: T; act: (fn: () => void) => Promise<void> }
}
