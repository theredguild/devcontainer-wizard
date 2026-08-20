/** Slugify a project/environment name into a safe identifier (matches the original wizard). */
export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/gi, '-')
      .replace(/^-+|-+$/g, '') || 'default'
  )
}

/**
 * Returns true if `name` is a safe, canonical environment identifier — i.e. it
 * survives `slugify` unchanged and is not a degenerate (leading-dot / all-dots)
 * value that would traverse paths or create hidden manifest files.
 *
 * This is the single source of truth used both at create time (after slugify)
 * and at every lifecycle command that resolves a name from user input or a
 * `.dcw` marker file.
 */
/** Longest accepted environment name — keeps `<name>.json`, `dcw-<name>` container
 *  names and `dcw/<name>:latest` image tags well under filesystem/engine limits. */
export const MAX_ENV_NAME_LENGTH = 63

export function isValidEnvName(name: string): boolean {
  if (name.length > MAX_ENV_NAME_LENGTH) return false
  if (name !== slugify(name)) return false
  // Reject leading-dot names ('.', '...', '.hidden') that would create hidden
  // manifest files or escape the environments dir.
  if (name.startsWith('.')) return false
  return true
}
