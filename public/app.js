const state = {
  matches: [],
  groups: [],
  rawConfig: null,
  cardFilter: 'all',
  selectedIds: new Set(),
};

function el(sel) { return document.querySelector(sel); }

function rentChip(match) {
  if (match.rentTag?.includes('priority')) return `<span class="chip priority">${match.rentTag}</span>`;
  if (match.rentTag?.includes('within budget')) return `<span class="chip budget">${match.rentTag}</span>`;
  return `<span class="chip unknown">${match.rentTag ?? ''}</span>`;
}

function locationChip(match) {
  if (match.locationTag?.startsWith('📍 Near DBS')) return `<span class="chip nearby">${match.locationTag}</span>`;
  return `<span class="chip unknown">${match.locationTag ?? ''}</span>`;
}

function isPriority(match) { return !!match.rentTag?.includes('priority'); }
function isNearby(match) { return !!match.locationTag?.startsWith('📍 Near DBS'); }
function isBookmarked(match) { return !!match.bookmarked; }

function matchCard(match) {
  const openLink = match.groupLink
    ? `<a class="btn btn-ghost" href="${match.groupLink}" target="_blank" rel="noopener">Open group</a>`
    : `<button class="btn btn-ghost" disabled title="Not available — you're not an admin of this group">Open group</button>`;

  return `
    <div class="match-card ${match.dismissed ? 'dismissed' : ''}" data-id="${match.id}">
      <div class="card-top">
        <label class="select-check">
          <input type="checkbox" class="select-box" data-id="${match.id}" ${state.selectedIds.has(match.id) ? 'checked' : ''} />
        </label>
        <button class="star-btn ${match.bookmarked ? 'active' : ''}" data-id="${match.id}" title="Bookmark">
          ${match.bookmarked ? '⭐' : '☆'}
        </button>
        <div class="meta">
          <span class="group-name">${match.group}</span>
          <span>·</span>
          <span>${match.sender}</span>
          <span>·</span>
          <span>${match.time}</span>
        </div>
      </div>
      <div class="meta">
        ${rentChip(match)}
        ${locationChip(match)}
      </div>
      <div class="text">${(match.text || '').replace(/</g, '&lt;')}</div>
      <input
        type="text"
        class="note-input"
        data-id="${match.id}"
        placeholder="Add a note (e.g. 'messaged landlord', 'ask about bills')…"
        value="${(match.note || '').replace(/"/g, '&quot;')}"
      />
      <div class="card-actions">
        ${openLink}
        <button class="btn btn-ghost push-btn" data-id="${match.id}">📤 Push to WhatsApp</button>
        <button class="btn btn-ghost dismiss-btn" data-id="${match.id}">${match.dismissed ? 'Dismissed' : 'Dismiss'}</button>
      </div>
    </div>
  `;
}

function updateStats() {
  el('#statTotal').textContent = state.matches.length;
  el('#statPriority').textContent = state.matches.filter(isPriority).length;
  el('#statNearby').textContent = state.matches.filter(isNearby).length;
  const watchedCount = state.rawConfig
    ? state.groups.filter((g) => {
        const inList = (state.rawConfig.groupIds || []).includes(g.id);
        const nameMatch = (state.rawConfig.groupNameKeywords || []).some((k) =>
          g.subject.toLowerCase().includes(k.toLowerCase())
        );
        const noFilters =
          (state.rawConfig.groupIds || []).length === 0 && (state.rawConfig.groupNameKeywords || []).length === 0;
        return noFilters || inList || nameMatch;
      }).length
    : 0;
  el('#statWatched').textContent = watchedCount;
}

function renderMatches() {
  const listEl = el('#matchList');
  const emptyEl = el('#emptyState');
  const query = el('#search').value.trim().toLowerCase();
  const showDismissed = el('#showDismissed').checked;

  let filtered = state.matches;
  if (!showDismissed) filtered = filtered.filter((m) => !m.dismissed);
  if (state.cardFilter === 'priority') filtered = filtered.filter(isPriority);
  if (state.cardFilter === 'nearby') filtered = filtered.filter(isNearby);
  if (state.cardFilter === 'bookmarked') filtered = filtered.filter(isBookmarked);
  if (query) {
    filtered = filtered.filter(
      (m) => (m.text || '').toLowerCase().includes(query) || (m.group || '').toLowerCase().includes(query)
    );
  }

  emptyEl.style.display = state.matches.length === 0 ? 'block' : 'none';
  listEl.innerHTML = filtered.map(matchCard).join('');
  updateStats();
  updatePushSelectedButton();
}

function updatePushSelectedButton() {
  const btn = el('#pushSelectedBtn');
  btn.disabled = state.selectedIds.size === 0;
  btn.textContent = state.selectedIds.size > 0 ? `📤 Push selected (${state.selectedIds.size})` : '📤 Push selected';
}

function setStatus({ connected, groupCount }) {
  el('#statusDot').classList.toggle('connected', !!connected);
  el('#statusText').textContent = connected ? 'Connected to WhatsApp' : 'Disconnected';
  el('#groupCount').textContent = groupCount ? `· ${groupCount} groups` : '';
  if (connected) hideQr();
}

function showToast({ type, message }) {
  const container = el('#toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type === 'error' ? 'error' : ''}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 5000);
}

function showQr(dataUrl) {
  el('#qrImage').src = dataUrl;
  el('#qrOverlay').classList.add('visible');
}

function hideQr() {
  el('#qrOverlay').classList.remove('visible');
}

async function loadMatches() {
  const res = await fetch('/api/matches');
  state.matches = await res.json();
  renderMatches();
}

async function loadStatus() {
  const res = await fetch('/api/status');
  setStatus(await res.json());
}

async function loadQr() {
  const res = await fetch('/api/qr');
  const { dataUrl } = await res.json();
  if (dataUrl) showQr(dataUrl);
}

function connectStream() {
  const source = new EventSource('/api/stream');
  source.addEventListener('match', (e) => {
    state.matches.unshift(JSON.parse(e.data));
    renderMatches();
  });
  source.addEventListener('status', (e) => setStatus(JSON.parse(e.data)));
  source.addEventListener('backfill', (e) => renderBackfillStatus(JSON.parse(e.data)));
  source.addEventListener('qr', (e) => showQr(JSON.parse(e.data).dataUrl));
  source.addEventListener('toast', (e) => showToast(JSON.parse(e.data)));
  source.onerror = () => setStatus({ connected: false, groupCount: state.groups.length });
}

function setupTabs() {
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
      btn.classList.add('active');
      el(`#tab-${btn.dataset.tab}`).classList.add('active');
    });
  });
}

function setupCardFilters() {
  document.querySelectorAll('.chip-filter').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.chip-filter').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      state.cardFilter = btn.dataset.filter;
      renderMatches();
    });
  });
}

function linesToArray(value) {
  return value.split('\n').map((s) => s.trim()).filter(Boolean);
}

function arrayToLines(arr) {
  return (arr || []).join('\n');
}

function renderGroupList() {
  const query = el('#groupSearch').value.trim().toLowerCase();
  const watched = new Set(state.rawConfig.groupIds || []);
  const filtered = query
    ? state.groups.filter((g) => g.subject.toLowerCase().includes(query))
    : state.groups;

  el('#groupList').innerHTML = filtered
    .map(
      (g) => `
      <label class="group-row">
        <input type="checkbox" value="${g.id}" ${watched.has(g.id) ? 'checked' : ''} />
        ${g.subject}
      </label>
    `
    )
    .join('');
}

async function loadFilters() {
  const [configRes, groupsRes] = await Promise.all([fetch('/api/config'), fetch('/api/groups')]);
  state.rawConfig = await configRes.json();
  state.groups = await groupsRes.json();

  el('#targetNumber').value = state.rawConfig.targetNumber || '';
  el('#maxRent').value = state.rawConfig.maxRent ?? '';
  el('#preferredRent').value = state.rawConfig.preferredRent ?? '';
  el('#include').value = arrayToLines(state.rawConfig.keywords?.include);
  el('#exclude').value = arrayToLines(state.rawConfig.keywords?.exclude);
  el('#nearbyAreaKeywords').value = arrayToLines(state.rawConfig.nearbyAreaKeywords);
  el('#groupNameKeywords').value = arrayToLines(state.rawConfig.groupNameKeywords);
  renderGroupList();
  updateStats();
}

async function saveFilters(e) {
  e.preventDefault();
  const checkedIds = [...document.querySelectorAll('#groupList input:checked')].map((cb) => cb.value);

  const payload = {
    ...state.rawConfig,
    targetNumber: el('#targetNumber').value.trim(),
    maxRent: Number(el('#maxRent').value) || Infinity,
    preferredRent: el('#preferredRent').value ? Number(el('#preferredRent').value) : null,
    keywords: {
      include: linesToArray(el('#include').value),
      exclude: linesToArray(el('#exclude').value),
    },
    nearbyAreaKeywords: linesToArray(el('#nearbyAreaKeywords').value),
    groupNameKeywords: linesToArray(el('#groupNameKeywords').value),
    groupIds: checkedIds,
  };

  const res = await fetch('/api/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const saveMsg = el('#saveMsg');
  if (res.ok) {
    state.rawConfig = payload;
    saveMsg.textContent = 'Saved — applied live, no restart needed.';
    saveMsg.style.color = 'var(--accent)';
    updateStats();
  } else {
    const { error } = await res.json();
    saveMsg.textContent = `Failed to save: ${error}`;
    saveMsg.style.color = 'var(--danger)';
  }
  setTimeout(() => (saveMsg.textContent = ''), 4000);
}

function renderBackfillStatus(payload) {
  const statusEl = el('#backfillStatus');
  const btn = el('#backfillBtn');

  if (payload.status === 'not-connected') {
    statusEl.textContent = 'Not connected to WhatsApp yet — try again once connected.';
    btn.disabled = false;
  } else if (payload.status === 'already-running') {
    statusEl.textContent = 'A search is already running.';
  } else if (payload.status === 'started') {
    btn.disabled = true;
    statusEl.textContent = `Starting search across ${payload.total} group(s)...`;
  } else if (payload.status === 'progress') {
    statusEl.textContent = `Requesting history: group ${payload.current}/${payload.total} — "${payload.group}"`;
  } else if (payload.status === 'requested') {
    btn.disabled = false;
    statusEl.textContent = `Requested history for ${payload.total} group(s). Matches will appear above as WhatsApp responds — this can take a few minutes, and some groups may return nothing.`;
  }
}

async function runBackfill() {
  el('#backfillBtn').disabled = true;
  await fetch('/api/backfill', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ allGroups: el('#allGroupsCheck').checked }),
  });
}

async function sendTestMessage() {
  await fetch('/api/test-message', { method: 'POST' });
}

async function exportMatches() {
  window.location = '/api/matches/export';
}

async function clearMatches() {
  if (!confirm('Clear all matches from the dashboard? This cannot be undone.')) return;
  await fetch('/api/matches/clear', { method: 'POST' });
  state.matches = [];
  renderMatches();
}

async function dismissMatch(id) {
  await fetch(`/api/matches/${id}/dismiss`, { method: 'POST' });
  const match = state.matches.find((m) => m.id === id);
  if (match) match.dismissed = true;
  renderMatches();
}

async function toggleBookmark(id) {
  const match = state.matches.find((m) => m.id === id);
  if (!match) return;
  const next = !match.bookmarked;
  await fetch(`/api/matches/${id}/bookmark`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bookmarked: next, note: match.note || '' }),
  });
  match.bookmarked = next;
  renderMatches();
}

async function saveNote(id, note) {
  const match = state.matches.find((m) => m.id === id);
  if (!match) return;
  match.note = note;
  await fetch(`/api/matches/${id}/bookmark`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bookmarked: !!match.bookmarked, note }),
  });
}

async function pushOne(id) {
  await fetch('/api/matches/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids: [id] }),
  });
}

async function pushSelected() {
  const ids = [...state.selectedIds];
  if (ids.length === 0) return;
  await fetch('/api/matches/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  });
  state.selectedIds.clear();
  renderMatches();
}

async function logout() {
  if (
    !confirm(
      'This logs out the currently linked WhatsApp account. You will need to scan a new QR code (can be a different account). Continue?'
    )
  )
    return;
  await fetch('/api/logout', { method: 'POST' });
}

setupTabs();
setupCardFilters();
loadMatches();
loadStatus();
loadFilters();
loadQr();
connectStream();

el('#search').addEventListener('input', renderMatches);
el('#showDismissed').addEventListener('change', renderMatches);
el('#groupSearch').addEventListener('input', renderGroupList);
el('#filterForm').addEventListener('submit', saveFilters);
el('#backfillBtn').addEventListener('click', runBackfill);
el('#testMessageBtn').addEventListener('click', sendTestMessage);
el('#exportBtn').addEventListener('click', exportMatches);
el('#clearBtn').addEventListener('click', clearMatches);
el('#logoutBtn').addEventListener('click', logout);
el('#pushSelectedBtn').addEventListener('click', pushSelected);

el('#matchList').addEventListener('click', (e) => {
  const dismissBtn = e.target.closest('.dismiss-btn');
  if (dismissBtn) return dismissMatch(dismissBtn.dataset.id);

  const starBtn = e.target.closest('.star-btn');
  if (starBtn) return toggleBookmark(starBtn.dataset.id);

  const pushBtn = e.target.closest('.push-btn');
  if (pushBtn) return pushOne(pushBtn.dataset.id);
});

el('#matchList').addEventListener('change', (e) => {
  if (e.target.classList.contains('select-box')) {
    const id = e.target.dataset.id;
    if (e.target.checked) state.selectedIds.add(id);
    else state.selectedIds.delete(id);
    updatePushSelectedButton();
  }
});

el('#matchList').addEventListener(
  'blur',
  (e) => {
    if (e.target.classList.contains('note-input')) {
      saveNote(e.target.dataset.id, e.target.value);
    }
  },
  true
);
