export function matchesFilters(text, { include, exclude }) {
  if (!text) return false;
  const lower = text.toLowerCase();

  if (exclude.some((word) => lower.includes(word))) return false;
  if (include.length === 0) return true;

  return include.some((word) => lower.includes(word));
}
