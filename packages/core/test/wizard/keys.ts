/**
 * Terminal key sequences the ink test harness writes to stdin.
 * Built from char codes so the control bytes stay legible in source.
 */
const ch = (code: number) => String.fromCharCode(code)

export const ENTER = ch(13)
export const ESC = ch(27)
export const UP = `${ESC}[A`
export const DOWN = `${ESC}[B`
export const BACKSPACE = ch(8)
export const DELETE = ch(127)
export const CTRL_A = ch(1)
export const CTRL_C = ch(3)
export const SPACE = ' '

/** Let ink flush a render between keystrokes. */
export const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 20))

/**
 * Write each key in turn, letting the component re-render between them.
 * The leading tick matters: ink discards input written before the first render,
 * so without it the opening keystroke of every test would be silently dropped.
 */
export async function type(stdin: { write: (s: string) => void }, ...keys: string[]): Promise<void> {
  await tick()
  for (const key of keys) {
    stdin.write(key)
    await tick()
  }
}
