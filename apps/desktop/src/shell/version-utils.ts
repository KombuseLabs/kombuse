import { gt, valid } from "semver";

export function isNewerVersion(latest: string, current: string): boolean {
  if (!valid(latest) || !valid(current)) {
    return false;
  }
  return gt(latest, current);
}
