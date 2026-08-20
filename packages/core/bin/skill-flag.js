/**
 * Top-level `dcw --skill` alias (inspired by `herdr --skill`).
 *
 * oclif has no root-level flags when commands live in a directory, so the bin
 * entry rewrites `--skill` into the `skill` command before dispatch. Only a
 * leading `--skill` is rewritten; any trailing args are preserved.
 */
export function skillArgv(argv) {
  return argv[0] === '--skill' ? ['skill', ...argv.slice(1)] : argv
}
