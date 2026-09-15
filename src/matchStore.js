import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { events } from './state.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');
const filePath = path.join(dataDir, 'matches.json');
const MAX_ENTRIES = 500;

if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

let matches = [];
if (existsSync(filePath)) {
  try {
    matches = JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    matches = [];
  }
}

function persist() {
  writeFileSync(filePath, JSON.stringify(matches));
}

export function addMatch(match) {
  matches.unshift(match);
  if (matches.length > MAX_ENTRIES) matches.length = MAX_ENTRIES;
  persist();
  events.emit('match', match);
}

export function getMatches() {
  return matches;
}

export function dismissMatch(id) {
  const match = matches.find((m) => m.id === id);
  if (!match) return false;
  match.dismissed = true;
  persist();
  return true;
}

export function setBookmark(id, bookmarked, note) {
  const match = matches.find((m) => m.id === id);
  if (!match) return false;
  match.bookmarked = !!bookmarked;
  match.note = note ?? match.note ?? '';
  persist();
  return true;
}

export function getMatchById(id) {
  return matches.find((m) => m.id === id);
}

export function clearMatches() {
  matches = [];
  persist();
}

export function refilterMatches(stillMatches) {
  let changed = 0;
  for (const match of matches) {
    if (match.dismissed) continue;
    if (!stillMatches(match)) {
      match.dismissed = true;
      match.autoDismissed = true;
      changed++;
    }
  }
  if (changed > 0) persist();
  return changed;
}
