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

export function addMatch(match) {
  matches.unshift(match);
  if (matches.length > MAX_ENTRIES) matches.length = MAX_ENTRIES;
  writeFileSync(filePath, JSON.stringify(matches));
  events.emit('match', match);
}

export function getMatches() {
  return matches;
}
