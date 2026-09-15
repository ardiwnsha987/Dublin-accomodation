export function matchesFilters(text, { include, exclude }) {
  if (!text) return false;
  const lower = text.toLowerCase();

  if (exclude.some((word) => lower.includes(word))) return false;
  if (include.length === 0) return true;

  return include.some((word) => lower.includes(word));
}

export function matchesGroupName(name, groupNameKeywords) {
  if (!name || groupNameKeywords.length === 0) return false;
  const lower = name.toLowerCase();
  return groupNameKeywords.some((word) => lower.includes(word));
}

export function isGroupWatched(jid, name, { groupIds, groupNameKeywords }) {
  if (groupIds.length === 0 && groupNameKeywords.length === 0) return true;
  if (groupIds.includes(jid)) return true;
  return matchesGroupName(name, groupNameKeywords);
}
