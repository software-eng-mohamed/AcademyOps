/**
 * Checks if a relative path matches any exclusion pattern.
 * Supports exact match and directory suffix wildcard '/**' (matching the directory
 * itself and any path strictly below it, but not sibling prefixes).
 */
export function isExcludedPath(relPath: string, exclusions: string[]): boolean {
  const normalized = relPath.replace(/\\/g, '/');
  for (const pattern of exclusions) {
    const normalizedPattern = pattern.replace(/\\/g, '/');
    if (normalizedPattern.endsWith('/**')) {
      const dir = normalizedPattern.slice(0, -3);
      if (normalized === dir || normalized.startsWith(dir + '/')) {
        return true;
      }
    } else if (normalized === normalizedPattern) {
      return true;
    }
  }
  return false;
}
