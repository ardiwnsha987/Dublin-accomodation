import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { readRawConfig, writeRawConfig } from './config.js';
import { getMatches, dismissMatch, clearMatches } from './matchStore.js';
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

  app.get('/api/qr', (req, res) => {
    res.json({ dataUrl: state.qr });
  });

  app.get('/api/matches', (req, res) => {
    res.json(getMatches());
  });

  app.post('/api/matches/:id/dismiss', (req, res) => {
    res.json({ ok: dismissMatch(req.params.id) });
  });

  app.post('/api/matches/clear', (req, res) => {
    clearMatches();
    res.json({ ok: true });
  });

  app.get('/api/matches/export', (req, res) => {
    res.set('Content-Disposition', 'attachment; filename="accommodation-matches.json"');
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
    events.emit('backfill-request', { allGroups: !!req.body?.allGroups });
    res.json({ ok: true });
  });

  app.post('/api/test-message', (req, res) => {
    events.emit('test-message-request');
    res.json({ ok: true });
  });

  app.post('/api/logout', (req, res) => {
    events.emit('logout-request');
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
    const onQr = (payload) => res.write(`event: qr\ndata: ${JSON.stringify(payload)}\n\n`);
    const onToast = (payload) => res.write(`event: toast\ndata: ${JSON.stringify(payload)}\n\n`);
    events.on('match', onMatch);
    events.on('status', onStatus);
    events.on('backfill', onBackfill);
    events.on('qr', onQr);
    events.on('toast', onToast);

    res.write(`event: status\ndata: ${JSON.stringify({ connected: state.connected, groupCount: state.groups.length })}\n\n`);
    if (state.qr) res.write(`event: qr\ndata: ${JSON.stringify({ dataUrl: state.qr })}\n\n`);

    req.on('close', () => {
      events.off('match', onMatch);
      events.off('status', onStatus);
      events.off('backfill', onBackfill);
      events.off('qr', onQr);
      events.off('toast', onToast);
    });
  });

  app.listen(PORT, () => {
    console.log(`\nDashboard running at http://localhost:${PORT}\n`);
  });
}
