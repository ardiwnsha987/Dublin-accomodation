import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');
const filePath = path.join(dataDir, 'seen-messages.json');
const MAX_ENTRIES = 1000;

if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

let seen = [];
if (existsSync(filePath)) {
  try {
    seen = JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    seen = [];
  }
}

const seenSet = new Set(seen);

export function hasSeen(id) {
  return seenSet.has(id);
}

export function markSeen(id) {
  seenSet.add(id);
  if (seenSet.size > MAX_ENTRIES) {
    const [oldest] = seenSet;
    seenSet.delete(oldest);
  }
  writeFileSync(filePath, JSON.stringify([...seenSet]));
}
