function keywordMatch(lower, keyword) {
  const isSingleWord = /^[a-z0-9]+$/i.test(keyword);
  if (isSingleWord) {
    return new RegExp(`\\b${keyword}\\b`, 'i').test(lower);
  }
  return lower.includes(keyword);
}

export function matchesFilters(text, { include, exclude, priorityInclude = [] }) {
  if (!text) return false;
  const lower = text.toLowerCase();

  if (priorityInclude.some((word) => keywordMatch(lower, word))) return true;

  if (exclude.some((word) => keywordMatch(lower, word))) return false;
  if (include.length === 0) return true;

  return include.some((word) => keywordMatch(lower, word));
}

const PRICE_PATTERNS = [/€\s?(\d{3,4})/g, /\b(\d{3,4})\s?(?:€|eur|euro|euros)\b/gi];

export function extractPrices(text) {
  if (!text) return [];
  const found = new Set();
  for (const pattern of PRICE_PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      found.add(Number(match[1]));
    }
  }
  return [...found];
}

export function findNearbyAreas(text, nearbyAreaKeywords) {
  if (!text || nearbyAreaKeywords.length === 0) return [];
  const lower = text.toLowerCase();
  return nearbyAreaKeywords.filter((area) => lower.includes(area));
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
