import { useState } from 'react'

export interface StepNav {
  index: number
  next: () => void
  back: () => void
  atStart: boolean
}

/** Linear forward/back navigation across a fixed number of wizard steps. */
export function useStepNav(total: number): StepNav {
  const [index, setIndex] = useState(0)
  return {
    index,
    next: () => setIndex((i) => Math.min(total - 1, i + 1)),
    back: () => setIndex((i) => Math.max(0, i - 1)),
    atStart: index === 0,
  }
}
