import { readFileSync, writeFileSync, existsSync, watch } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const configPath = path.join(__dirname, '..', 'config.json');

if (!existsSync(configPath)) {
  console.error(
    'Missing config.json. Copy config.example.json to config.json and fill in your details, then run again.'
  );
  process.exit(1);
}

function toJid(number) {
  const digits = String(number).replace(/[^0-9]/g, '');
  return `${digits}@s.whatsapp.net`;
}

export function readRawConfig() {
  return JSON.parse(readFileSync(configPath, 'utf8'));
}

export function writeRawConfig(raw) {
  if (!raw.targetNumber) throw new Error('targetNumber is required');
  writeFileSync(configPath, JSON.stringify(raw, null, 2));
}

export const config = {};

function applyRaw(raw) {
  config.targetJid = toJid(raw.targetNumber);
  config.groupIds = Array.isArray(raw.groupIds) ? raw.groupIds : [];
  config.groupNameKeywords = (raw.groupNameKeywords ?? []).map((k) => k.toLowerCase());
  config.include = raw.keywords?.include?.map((k) => k.toLowerCase()) ?? [];
  config.exclude = raw.keywords?.exclude?.map((k) => k.toLowerCase()) ?? [];
  config.priorityInclude = (raw.priorityInclude ?? []).map((k) => k.toLowerCase());
  config.maxRent = raw.maxRent ?? Infinity;
  config.preferredRent = raw.preferredRent ?? null;
  config.nearbyAreaKeywords = (raw.nearbyAreaKeywords ?? []).map((k) => k.toLowerCase());
}

export function reloadConfig() {
  const raw = readRawConfig();
  if (!raw.targetNumber) {
    console.error('config.json is missing "targetNumber" — keeping previous settings.');
    return;
  }
  applyRaw(raw);
}

reloadConfig();

export function watchConfigFile() {
  let timer;
  watch(configPath, () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        reloadConfig();
        console.log('Config reloaded from config.json.');
      } catch (err) {
        console.error('Failed to reload config.json — keeping previous settings.', err.message);
      }
    }, 300);
  });
}
