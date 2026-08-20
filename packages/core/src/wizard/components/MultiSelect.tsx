import { Box, Text, useInput } from 'ink'
import { useState } from 'react'

export interface MultiSelectItem {
  label: string
  value: string
  hint?: string
}

export interface MultiSelectProps {
  items: MultiSelectItem[]
  initial?: string[]
  onSubmit: (values: string[]) => void
  onBack?: () => void
}

/** Multi-choice list. Arrows move, Space toggles, Enter confirms, Esc goes back. */
export function MultiSelect({ items, initial = [], onSubmit, onBack }: MultiSelectProps) {
  const [cursor, setCursor] = useState(0)
  const [selected, setSelected] = useState<Set<string>>(new Set(initial))

  useInput((input, key) => {
    if (key.upArrow) setCursor((c) => (c - 1 + items.length) % items.length)
    else if (key.downArrow) setCursor((c) => (c + 1) % items.length)
    else if (input === ' ') {
      const item = items[cursor]
      if (item) {
        setSelected((prev) => {
          const nextSet = new Set(prev)
          if (nextSet.has(item.value)) nextSet.delete(item.value)
          else nextSet.add(item.value)
          return nextSet
        })
      }
    } else if (key.return) {
      onSubmit(items.filter((i) => selected.has(i.value)).map((i) => i.value))
    } else if (key.escape) onBack?.()
  })

  return (
    <Box flexDirection="column">
      {items.length === 0 ? <Text color="gray">(no options)</Text> : null}
      {items.map((item, i) => {
        const active = i === cursor
        const checked = selected.has(item.value)
        return (
          <Text key={item.value} color={active ? 'cyan' : undefined}>
            {active ? '❯ ' : '  '}
            {checked ? '◉ ' : '◯ '}
            {item.label}
          </Text>
        )
      })}
      {items[cursor]?.hint ? (
        <Box marginTop={1}>
          <Text color="gray">{items[cursor]!.hint}</Text>
        </Box>
      ) : null}
      <Box marginTop={1}>
        <Text color="gray">space toggle · enter confirm · esc back</Text>
      </Box>
    </Box>
  )
}
