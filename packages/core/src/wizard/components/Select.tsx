import { Box, Text, useInput } from 'ink'
import { useState } from 'react'

export interface SelectChoice {
  label: string
  value: string
  hint?: string
  disabled?: boolean
}

export interface SelectProps {
  choices: SelectChoice[]
  initialValue?: string
  onSubmit: (value: string) => void
  onBack?: () => void
}

function nextEnabled(choices: SelectChoice[], from: number, dir: 1 | -1): number {
  const n = choices.length
  let i = from
  for (let step = 0; step < n; step++) {
    i = (i + dir + n) % n
    if (!choices[i]?.disabled) return i
  }
  return from
}

/** Single-choice list. Arrows move, Enter selects, Esc goes back. */
export function Select({ choices, initialValue, onSubmit, onBack }: SelectProps) {
  const initialIndex = Math.max(
    0,
    choices.findIndex((c) => c.value === initialValue && !c.disabled),
  )
  const start = choices[initialIndex]?.disabled ? nextEnabled(choices, initialIndex, 1) : initialIndex
  const [cursor, setCursor] = useState(start)

  useInput((_input, key) => {
    if (key.upArrow) setCursor((c) => nextEnabled(choices, c, -1))
    else if (key.downArrow) setCursor((c) => nextEnabled(choices, c, 1))
    else if (key.return) {
      const choice = choices[cursor]
      if (choice && !choice.disabled) onSubmit(choice.value)
    } else if (key.escape) onBack?.()
  })

  return (
    <Box flexDirection="column">
      {choices.map((c, i) => {
        const active = i === cursor
        const color = c.disabled ? 'gray' : active ? 'cyan' : undefined
        return (
          <Text key={c.value} color={color}>
            {active ? '❯ ' : '  '}
            {c.label}
            {c.disabled ? ' (unavailable)' : ''}
          </Text>
        )
      })}
      {choices[cursor]?.hint ? (
        <Box marginTop={1}>
          <Text color="gray">{choices[cursor]!.hint}</Text>
        </Box>
      ) : null}
    </Box>
  )
}
