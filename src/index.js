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
import { config } from './config.js';
import { matchesFilters } from './matcher.js';
import { hasSeen, markSeen } from './seenStore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const authDir = path.join(__dirname, '..', 'auth_info');

const logger = pino({ level: 'warn' });
const groupNameCache = new Map();

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

async function start() {
  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger,
    printQRInTerminal: false,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('\nScan this QR code with WhatsApp (Linked devices > Link a device):\n');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'open') {
      console.log('Connected to WhatsApp.');
      const groups = await sock.groupFetchAllParticipating();
      const list = Object.values(groups);
      console.log(`\nYou are in ${list.length} groups:`);
      for (const g of list) {
        groupNameCache.set(g.id, g.subject);
        console.log(`  ${g.subject} -> ${g.id}`);
      }
      if (config.groupIds.length === 0) {
        console.log(
          '\nNo groupIds set in config.json — currently watching ALL of the groups above.'
        );
        console.log('To narrow it down, paste the ids you care about into "groupIds".\n');
      } else {
        console.log(`\nWatching ${config.groupIds.length} configured group(s).\n`);
      }
    }

    if (connection === 'close') {
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
      const remoteJid = msg.key.remoteJid;
      if (!remoteJid?.endsWith('@g.us')) continue;
      if (msg.key.fromMe) continue;

      const id = msg.key.id;
      if (hasSeen(id)) continue;

      if (config.groupIds.length > 0 && !config.groupIds.includes(remoteJid)) continue;

      const text = extractText(msg.message);
      if (!matchesFilters(text, config)) continue;

      markSeen(id);

      const groupName = await getGroupName(sock, remoteJid);
      const sender = msg.pushName || msg.key.participant || 'Unknown';
      const timestamp = new Date((msg.messageTimestamp ?? Date.now() / 1000) * 1000).toLocaleString(
        'en-IE',
        { timeZone: 'Europe/Dublin' }
      );

      const forward =
        `📍 New accommodation match\n` +
        `Group: ${groupName}\n` +
        `From: ${sender}\n` +
        `Time: ${timestamp}\n\n` +
        `${text}`;

      try {
        await sock.sendMessage(config.targetJid, { text: forward });
        console.log(`Forwarded a match from "${groupName}".`);
      } catch (err) {
        console.error('Failed to forward message:', err);
      }
    }
  });
}

start();
