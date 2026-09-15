import {
  default as makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import qrcode from 'qrcode-terminal';
import path from 'path';
import { fileURLToPath } from 'url';
import { config, watchConfigFile } from './config.js';
import { matchesFilters, isGroupWatched, extractPrices, findNearbyAreas } from './matcher.js';
import { hasSeen, markSeen } from './seenStore.js';
import { addMatch } from './matchStore.js';
import { setConnected, setGroups, state, events } from './state.js';
import { startServer } from './server.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const authDir = path.join(__dirname, '..', 'auth_info');

const logger = pino({ level: 'silent' });
const groupNameCache = new Map();
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let currentSock = null;
let backfillRunning = false;

function extractText(message) {
  if (!message) return '';
  return (
    message.conversation ||
    message.extendedTextMessage?.text ||
    message.imageMessage?.caption ||
    message.videoMessage?.caption ||
    ''
  );
}

async function getGroupName(sock, jid) {
  if (groupNameCache.has(jid)) return groupNameCache.get(jid);
  try {
    const metadata = await sock.groupMetadata(jid);
    groupNameCache.set(jid, metadata.subject);
    return metadata.subject;
  } catch {
    return jid;
  }
}

async function processMessage(sock, msg) {
  const remoteJid = msg.key.remoteJid;
  if (!remoteJid?.endsWith('@g.us')) return;
  if (msg.key.fromMe) return;

  const id = msg.key.id;
  if (hasSeen(id)) return;

  const groupName = await getGroupName(sock, remoteJid);
  if (!isGroupWatched(remoteJid, groupName, config)) return;

  const text = extractText(msg.message);
  if (!matchesFilters(text, config)) return;

  const prices = extractPrices(text);
  if (prices.length === 1 && prices[0] >= config.maxRent) return;

  markSeen(id);

  const sender = msg.pushName || msg.key.participant || 'Unknown';
  const timestamp = new Date((msg.messageTimestamp ?? Date.now() / 1000) * 1000).toLocaleString(
    'en-IE',
    { timeZone: 'Europe/Dublin' }
  );

  let rentTag;
  if (prices.length === 0) {
    rentTag = '💰 Price not stated — check manually';
  } else if (prices.length > 1) {
    rentTag = `💰 Multiple prices mentioned (€${prices.join(', €')}) — check manually`;
  } else if (prices[0] <= config.preferredRent) {
    rentTag = `💰 €${prices[0]}/month — priority (≤ €${config.preferredRent})`;
  } else {
    rentTag = `💰 €${prices[0]}/month — within budget (< €${config.maxRent})`;
  }

  const nearbyMatches = findNearbyAreas(text, config.nearbyAreaKeywords);
  const locationTag =
    nearbyMatches.length > 0
      ? `📍 Near DBS (mentions: ${nearbyMatches.join(', ')})`
      : '📍 Location not clearly near DBS — check manually';

  const forward =
    `🏠 New accommodation match\n` +
    `Group: ${groupName}\n` +
    `From: ${sender}\n` +
    `Time: ${timestamp}\n` +
    `${rentTag}\n` +
    `${locationTag}\n\n` +
    `${text}`;

  try {
    await sock.sendMessage(config.targetJid, { text: forward });
    console.log(`Forwarded a match from "${groupName}".`);
    addMatch({ id, group: groupName, sender, time: timestamp, rentTag, locationTag, text });
  } catch (err) {
    console.error('Failed to forward message:', err);
  }
}

async function runBackfill(sock) {
  if (backfillRunning) {
    events.emit('backfill', { status: 'already-running' });
    return;
  }
  backfillRunning = true;

  const watched = state.groups.filter((g) => isGroupWatched(g.id, g.subject, config));
  events.emit('backfill', { status: 'started', total: watched.length });

  for (let i = 0; i < watched.length; i++) {
    const g = watched[i];
    events.emit('backfill', {
      status: 'progress',
      current: i + 1,
      total: watched.length,
      group: g.subject,
    });
    try {
      await sock.fetchMessageHistory(50, { remoteJid: g.id, fromMe: false, id: '' }, Date.now());
    } catch (err) {
      console.error(`History request failed for "${g.subject}":`, err.message);
    }
    await delay(2500);
  }

  events.emit('backfill', { status: 'requested', total: watched.length });
  backfillRunning = false;
}

events.on('backfill-request', () => {
  if (!currentSock) {
    events.emit('backfill', { status: 'not-connected' });
    return;
  }
  runBackfill(currentSock);
});

async function start() {
  const { state: authState, saveCreds } = await useMultiFileAuthState(authDir);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: authState,
    logger,
    printQRInTerminal: false,
  });

  currentSock = sock;

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('\nScan this QR code with WhatsApp (Linked devices > Link a device):\n');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'open') {
      console.log('Connected to WhatsApp.');
      setConnected(true);
      const groups = await sock.groupFetchAllParticipating();
      const list = Object.values(groups).map((g) => ({ id: g.id, subject: g.subject }));
      setGroups(list);
      console.log(`\nYou are in ${list.length} groups:`);
      for (const g of list) {
        groupNameCache.set(g.id, g.subject);
        console.log(`  ${g.subject} -> ${g.id}`);
      }
      if (config.groupIds.length === 0 && config.groupNameKeywords.length === 0) {
        console.log(
          '\nNo groupIds or groupNameKeywords set — currently watching ALL of the groups above.'
        );
        console.log('To narrow it down, set "groupIds" and/or "groupNameKeywords" in config.json.\n');
      } else {
        const watched = list.filter((g) => isGroupWatched(g.id, g.subject, config));
        console.log(`\nWatching ${watched.length} group(s) (explicit list + name-keyword matches):`);
        for (const g of watched) console.log(`  ${g.subject}`);
        console.log(
          'Any group you join later whose name matches groupNameKeywords will be watched automatically too.\n'
        );
      }
    }

    if (connection === 'close') {
      setConnected(false);
      if (currentSock === sock) currentSock = null;
      const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
      const loggedOut = statusCode === DisconnectReason.loggedOut;
      console.log('Connection closed.', loggedOut ? 'Logged out.' : 'Reconnecting...');
      if (!loggedOut) {
        start();
      } else {
        console.log('Delete the auth_info/ folder and restart to log in again.');
      }
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      await processMessage(sock, msg);
    }
  });

  sock.ev.on('messaging-history.set', async ({ messages }) => {
    console.log(`Received ${messages.length} historical message(s) from WhatsApp, checking for matches...`);
    for (const msg of messages) {
      await processMessage(sock, msg);
    }
  });
}

startServer();
watchConfigFile();
start();
