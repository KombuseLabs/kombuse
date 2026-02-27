import { gt, gte, valid, rcompare, maxSatisfying } from 'semver'

export function isValidVersion(version: string): boolean {
  return valid(version) !== null
}

export function isNewerVersion(candidate: string, current: string): boolean {
  if (!valid(candidate) || !valid(current)) return false
  return gt(candidate, current)
}

export function sortVersionsDesc(versions: string[]): string[] {
  return [...versions].filter((v) => valid(v) !== null).sort(rcompare)
}

export function findLatest(versions: string[]): string | null {
  const sorted = sortVersionsDesc(versions)
  return sorted[0] ?? null
}

export function findMaxSatisfying(
  versions: string[],
  range: string
): string | null {
  return maxSatisfying(versions, range)
}

export function meetsMinimumVersion(installed: string, minimum: string): boolean {
  if (!valid(installed) || !valid(minimum)) return false
  return gte(installed, minimum)
}
