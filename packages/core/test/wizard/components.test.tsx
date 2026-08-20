import { render } from 'ink-testing-library'
import { createElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { Banner } from '../../src/wizard/components/Banner.js'
import { MultiSelect } from '../../src/wizard/components/MultiSelect.js'
import { Select } from '../../src/wizard/components/Select.js'
import { TextInput } from '../../src/wizard/components/TextInput.js'
import { BACKSPACE, CTRL_A, DELETE, DOWN, ENTER, ESC, SPACE, UP, tick, type } from './keys.js'

describe('Banner', () => {
  it('renders a 1-based step counter and the step title', () => {
    const { lastFrame } = render(createElement(Banner, { step: 2, total: 10, title: 'Frameworks' }))
    expect(lastFrame()).toContain('dcw · container environment wizard')
    expect(lastFrame()).toContain('Step 3/10 — Frameworks')
  })

  it('shows the counter alone when there is no title for the step', () => {
    const { lastFrame } = render(createElement(Banner, { step: 0, total: 10 }))
    expect(lastFrame()).toContain('Step 1/10')
    expect(lastFrame()).not.toContain('—')
  })
})

describe('Select', () => {
  const choices = [
    { label: 'Alpha', value: 'a', hint: 'first' },
    { label: 'Beta', value: 'b', hint: 'second', disabled: true },
    { label: 'Gamma', value: 'c', hint: 'third' },
  ]

  it('marks the cursor row, flags disabled rows, and shows the active hint', async () => {
    const { lastFrame } = render(createElement(Select, { choices, onSubmit: vi.fn() }))
    await tick()
    const frame = lastFrame() ?? ''
    expect(frame).toContain('❯ Alpha')
    expect(frame).toContain('Beta (unavailable)')
    expect(frame).toContain('first')
  })

  it('starts on the choice matching initialValue', async () => {
    const { lastFrame } = render(createElement(Select, { choices, initialValue: 'c', onSubmit: vi.fn() }))
    await tick()
    expect(lastFrame()).toContain('❯ Gamma')
  })

  it('skips a disabled initialValue rather than starting on an unselectable row', async () => {
    const { lastFrame } = render(createElement(Select, { choices, initialValue: 'b', onSubmit: vi.fn() }))
    await tick()
    expect(lastFrame()).toContain('❯ Alpha')
  })

  it('falls back to the first row when initialValue matches nothing', async () => {
    const { lastFrame } = render(createElement(Select, { choices, initialValue: 'nope', onSubmit: vi.fn() }))
    await tick()
    expect(lastFrame()).toContain('❯ Alpha')
  })

  it('steps over disabled rows when moving down, and wraps around', async () => {
    const { stdin, lastFrame } = render(createElement(Select, { choices, onSubmit: vi.fn() }))
    await type(stdin, DOWN)
    expect(lastFrame()).toContain('❯ Gamma')
    await type(stdin, DOWN)
    expect(lastFrame()).toContain('❯ Alpha')
  })

  it('steps over disabled rows when moving up, and wraps around', async () => {
    const { stdin, lastFrame } = render(createElement(Select, { choices, onSubmit: vi.fn() }))
    await type(stdin, UP)
    expect(lastFrame()).toContain('❯ Gamma')
  })

  it('stays put when every other choice is disabled', async () => {
    const onlyOne = [
      { label: 'Solo', value: 's' },
      { label: 'Off', value: 'o', disabled: true },
    ]
    const { stdin, lastFrame } = render(createElement(Select, { choices: onlyOne, onSubmit: vi.fn() }))
    await type(stdin, DOWN)
    expect(lastFrame()).toContain('❯ Solo')
  })

  it('submits the highlighted value on Enter', async () => {
    const onSubmit = vi.fn()
    const { stdin } = render(createElement(Select, { choices, onSubmit }))
    await type(stdin, DOWN, ENTER)
    expect(onSubmit).toHaveBeenCalledWith('c')
  })

  it('never submits a disabled choice', async () => {
    const onSubmit = vi.fn()
    const disabledFirst = [
      { label: 'Off', value: 'o', disabled: true },
      { label: 'On', value: 'n' },
    ]
    const { stdin } = render(createElement(Select, { choices: disabledFirst, initialValue: 'o', onSubmit }))
    // initialIndex 0 is disabled, so the cursor has already moved past it.
    await type(stdin, ENTER)
    expect(onSubmit).toHaveBeenCalledWith('n')
  })

  it('calls onBack on Esc, and tolerates its absence', async () => {
    const onBack = vi.fn()
    const withBack = render(createElement(Select, { choices, onSubmit: vi.fn(), onBack }))
    await type(withBack.stdin, ESC)
    expect(onBack).toHaveBeenCalledOnce()

    const withoutBack = render(createElement(Select, { choices, onSubmit: vi.fn() }))
    await type(withoutBack.stdin, ESC)
    expect(withoutBack.lastFrame()).toContain('Alpha')
  })

  it('has nowhere to move, and submits nothing, when every choice is disabled', async () => {
    const onSubmit = vi.fn()
    const allOff = [
      { label: 'Off1', value: 'a', disabled: true },
      { label: 'Off2', value: 'b', disabled: true },
    ]
    const { stdin, lastFrame } = render(createElement(Select, { choices: allOff, onSubmit }))
    await type(stdin, DOWN, UP, ENTER)
    expect(lastFrame()).toContain('❯ Off1')
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('omits the hint block for a choice that has none', async () => {
    const { lastFrame } = render(createElement(Select, { choices: [{ label: 'Bare', value: 'x' }], onSubmit: vi.fn() }))
    await tick()
    expect(lastFrame()?.trim()).toBe('❯ Bare')
  })
})

describe('MultiSelect', () => {
  const items = [
    { label: 'Rust', value: 'rust', hint: 'cargo' },
    { label: 'Python', value: 'python', hint: 'pip' },
    { label: 'Go', value: 'go' },
  ]

  it('renders checkboxes, pre-checking the initial selection, and shows the active hint', async () => {
    const { lastFrame } = render(createElement(MultiSelect, { items, initial: ['python'], onSubmit: vi.fn() }))
    await tick()
    const frame = lastFrame() ?? ''
    expect(frame).toContain('❯ ◯ Rust')
    expect(frame).toContain('◉ Python')
    expect(frame).toContain('cargo')
    expect(frame).toContain('space toggle · enter confirm · esc back')
  })

  it('toggles the highlighted item on space, on and off again', async () => {
    const { stdin, lastFrame } = render(createElement(MultiSelect, { items, onSubmit: vi.fn() }))
    await type(stdin, SPACE)
    expect(lastFrame()).toContain('❯ ◉ Rust')
    await type(stdin, SPACE)
    expect(lastFrame()).toContain('❯ ◯ Rust')
  })

  it('moves the cursor with the arrows and wraps in both directions', async () => {
    const { stdin, lastFrame } = render(createElement(MultiSelect, { items, onSubmit: vi.fn() }))
    await type(stdin, UP)
    expect(lastFrame()).toContain('❯ ◯ Go')
    await type(stdin, DOWN)
    expect(lastFrame()).toContain('❯ ◯ Rust')
  })

  it('submits the selection in catalog order, not toggle order', async () => {
    const onSubmit = vi.fn()
    const { stdin } = render(createElement(MultiSelect, { items, onSubmit }))
    await type(stdin, DOWN, DOWN, SPACE, UP, UP, SPACE, ENTER)
    expect(onSubmit).toHaveBeenCalledWith(['rust', 'go'])
  })

  it('submits an empty array when nothing is selected', async () => {
    const onSubmit = vi.fn()
    const { stdin } = render(createElement(MultiSelect, { items, onSubmit }))
    await type(stdin, ENTER)
    expect(onSubmit).toHaveBeenCalledWith([])
  })

  it('calls onBack on Esc, and tolerates its absence', async () => {
    const onBack = vi.fn()
    const withBack = render(createElement(MultiSelect, { items, onSubmit: vi.fn(), onBack }))
    await type(withBack.stdin, ESC)
    expect(onBack).toHaveBeenCalledOnce()

    const withoutBack = render(createElement(MultiSelect, { items, onSubmit: vi.fn() }))
    await type(withoutBack.stdin, ESC)
    expect(withoutBack.lastFrame()).toContain('Rust')
  })

  it('renders an empty-state line and submits nothing when there are no items', async () => {
    const onSubmit = vi.fn()
    const { stdin, lastFrame } = render(createElement(MultiSelect, { items: [], onSubmit }))
    await tick()
    expect(lastFrame()).toContain('(no options)')
    await type(stdin, SPACE, ENTER)
    expect(onSubmit).toHaveBeenCalledWith([])
  })
})

describe('TextInput', () => {
  it('renders the label, the current value and a cursor', async () => {
    const { lastFrame } = render(
      createElement(TextInput, { label: 'Environment name:', initial: 'demo', onSubmit: vi.fn() }),
    )
    await tick()
    expect(lastFrame()).toContain('Environment name:')
    expect(lastFrame()).toContain('demo')
  })

  it('appends typed characters', async () => {
    const { stdin, lastFrame } = render(createElement(TextInput, { label: 'n:', onSubmit: vi.fn() }))
    await type(stdin, 'a', 'b', 'c')
    expect(lastFrame()).toContain('abc')
  })

  it('removes the last character on backspace and on delete', async () => {
    const { stdin, lastFrame } = render(createElement(TextInput, { label: 'n:', initial: 'abcd', onSubmit: vi.fn() }))
    await type(stdin, BACKSPACE)
    expect(lastFrame()).toContain('abc')
    await type(stdin, DELETE)
    expect(lastFrame()).toContain('ab')
  })

  it('ignores control chords rather than inserting them', async () => {
    const { stdin, lastFrame } = render(createElement(TextInput, { label: 'n:', initial: 'ab', onSubmit: vi.fn() }))
    await type(stdin, CTRL_A)
    expect(lastFrame()).toContain('ab')
  })

  it('submits the trimmed value on Enter', async () => {
    const onSubmit = vi.fn()
    const { stdin } = render(createElement(TextInput, { label: 'n:', initial: '  demo  ', onSubmit }))
    await type(stdin, ENTER)
    expect(onSubmit).toHaveBeenCalledWith('demo')
  })

  it('calls onBack on Esc, and tolerates its absence', async () => {
    const onBack = vi.fn()
    const withBack = render(createElement(TextInput, { label: 'n:', onSubmit: vi.fn(), onBack }))
    await type(withBack.stdin, ESC)
    expect(onBack).toHaveBeenCalledOnce()

    const withoutBack = render(createElement(TextInput, { label: 'n:', initial: 'x', onSubmit: vi.fn() }))
    await type(withoutBack.stdin, ESC)
    expect(withoutBack.lastFrame()).toContain('x')
  })
})
