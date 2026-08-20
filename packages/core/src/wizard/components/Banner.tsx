import { Box, Text } from 'ink'

export function Banner({ step, total, title }: { step: number; total: number; title?: string }) {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color="magenta" bold>
        dcw · container environment wizard
      </Text>
      <Text color="gray">
        Step {step + 1}/{total}
        {title ? ` — ${title}` : ''}
      </Text>
    </Box>
  )
}
