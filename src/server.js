import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { readRawConfig, writeRawConfig } from './config.js';
import { getMatches } from './matchStore.js';
import { state, events } from './state.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

export function startServer() {
  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.get('/api/status', (req, res) => {
    res.json({ connected: state.connected, groupCount: state.groups.length });
  });

  app.get('/api/groups', (req, res) => {
    res.json(state.groups);
  });

  app.get('/api/matches', (req, res) => {
    res.json(getMatches());
  });

  app.get('/api/config', (req, res) => {
    res.json(readRawConfig());
  });

  app.post('/api/config', (req, res) => {
    try {
      writeRawConfig(req.body);
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  app.post('/api/backfill', (req, res) => {
    events.emit('backfill-request');
    res.json({ ok: true });
  });

  app.get('/api/stream', (req, res) => {
    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.flushHeaders();

    const onMatch = (match) => res.write(`event: match\ndata: ${JSON.stringify(match)}\n\n`);
    const onStatus = (status) => res.write(`event: status\ndata: ${JSON.stringify(status)}\n\n`);
    const onBackfill = (payload) => res.write(`event: backfill\ndata: ${JSON.stringify(payload)}\n\n`);
    events.on('match', onMatch);
    events.on('status', onStatus);
    events.on('backfill', onBackfill);

    res.write(`event: status\ndata: ${JSON.stringify({ connected: state.connected, groupCount: state.groups.length })}\n\n`);

    req.on('close', () => {
      events.off('match', onMatch);
      events.off('status', onStatus);
      events.off('backfill', onBackfill);
    });
  });

  app.listen(PORT, () => {
    console.log(`\nDashboard running at http://localhost:${PORT}\n`);
  });
}
