import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.join(__dirname, '..', 'config.json');

if (!existsSync(configPath)) {
  console.error(
    'Missing config.json. Copy config.example.json to config.json and fill in your details, then run again.'
  );
  process.exit(1);
}

const raw = JSON.parse(readFileSync(configPath, 'utf8'));

if (!raw.targetNumber) {
  console.error('config.json is missing "targetNumber" (the WhatsApp number to receive alerts).');
  process.exit(1);
}

function toJid(number) {
  const digits = String(number).replace(/[^0-9]/g, '');
  return `${digits}@s.whatsapp.net`;
}

export const config = {
  targetJid: toJid(raw.targetNumber),
  groupIds: Array.isArray(raw.groupIds) ? raw.groupIds : [],
  groupNameKeywords: (raw.groupNameKeywords ?? []).map((k) => k.toLowerCase()),
  include: raw.keywords?.include?.map((k) => k.toLowerCase()) ?? [],
  exclude: raw.keywords?.exclude?.map((k) => k.toLowerCase()) ?? [],
  maxRent: raw.maxRent ?? Infinity,
  preferredRent: raw.preferredRent ?? null,
  nearbyAreaKeywords: (raw.nearbyAreaKeywords ?? []).map((k) => k.toLowerCase()),
};
