/**
 * Convert a SemVer string to its caret-minor range.
 *
 *   "0.3.5"        → "^0.3.0"
 *   "1.2.3"        → "^1.2.0"
 *   "2.0.0-beta.1" → "^2.0.0-beta.1"    (pre-releases kept verbatim as a safe-default)
 *   "" / garbage   → "^0.0.0"
 *
 * Used in two places — context.ts (CLI's own version) and version-resolver.ts
 * (registry-published version) — so they stay in lockstep on shape choices.
 */
export function toCaretMinor(version: string): string {
  if (!version) return '^0.0.0';
  // Pre-release / build metadata: keep exact — we don't want `^0.5.0-beta.3`
  // to silently match a newer pre-release that breaks API.
  if (/[-+]/.test(version)) return `^${version}`;
  const match = version.match(/^(\d+)\.(\d+)\./);
  if (!match) return `^${version}`;
  return `^${match[1]}.${match[2]}.0`;
}
