import { Box, Text, useInput } from 'ink'
import { useState } from 'react'

export interface TextInputProps {
  label: string
  initial?: string
  onSubmit: (value: string) => void
  onBack?: () => void
}

/** Minimal single-line text input. Enter submits, Esc goes back. */
export function TextInput({ label, initial = '', onSubmit, onBack }: TextInputProps) {
  const [value, setValue] = useState(initial)

  useInput((input, key) => {
    if (key.return) {
      onSubmit(value.trim())
      return
    }
    if (key.escape) {
      onBack?.()
      return
    }
    if (key.backspace || key.delete) {
      setValue((v) => v.slice(0, -1))
      return
    }
    if (input && !key.ctrl && !key.meta) {
      setValue((v) => v + input)
    }
  })

  return (
    <Box>
      <Text color="cyan">{label} </Text>
      <Text>{value}</Text>
      <Text color="gray">▏</Text>
    </Box>
  )
}
