export function deriveProjectNameFromPath(path: string) {
  const normalized = path.trim().replace(/[\\/]+$/, "");
  if (!normalized) return "";
  const parts = normalized.split(/[\\/]/);
  return parts[parts.length - 1] ?? "";
}
