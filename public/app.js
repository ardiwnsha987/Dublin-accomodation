const state = {
  matches: [],
  groups: [],
  rawConfig: null,
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

function matchCard(match) {
  return `
    <div class="match-card" data-text="${(match.text || '').replace(/"/g, '&quot;').toLowerCase()}">
      <div class="meta">
        <span class="group-name">${match.group}</span>
        <span>·</span>
        <span>${match.sender}</span>
        <span>·</span>
        <span>${match.time}</span>
      </div>
      <div class="meta">
        ${rentChip(match)}
        ${locationChip(match)}
      </div>
      <div class="text">${(match.text || '').replace(/</g, '&lt;')}</div>
    </div>
  `;
}

function renderMatches() {
  const listEl = el('#matchList');
  const emptyEl = el('#emptyState');
  const query = el('#search').value.trim().toLowerCase();
  const filtered = query
    ? state.matches.filter((m) => (m.text || '').toLowerCase().includes(query) || (m.group || '').toLowerCase().includes(query))
    : state.matches;

  emptyEl.style.display = state.matches.length === 0 ? 'block' : 'none';
  listEl.innerHTML = filtered.map(matchCard).join('');
}

function setStatus({ connected, groupCount }) {
  el('#statusDot').classList.toggle('connected', !!connected);
  el('#statusText').textContent = connected ? 'Connected to WhatsApp' : 'Disconnected';
  el('#groupCount').textContent = groupCount ? `· ${groupCount} groups` : '';
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

function connectStream() {
  const source = new EventSource('/api/stream');
  source.addEventListener('match', (e) => {
    state.matches.unshift(JSON.parse(e.data));
    renderMatches();
  });
  source.addEventListener('status', (e) => setStatus(JSON.parse(e.data)));
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
  } else {
    const { error } = await res.json();
    saveMsg.textContent = `Failed to save: ${error}`;
    saveMsg.style.color = 'var(--danger)';
  }
  setTimeout(() => (saveMsg.textContent = ''), 4000);
}

setupTabs();
loadMatches();
loadStatus();
loadFilters();
connectStream();

el('#search').addEventListener('input', renderMatches);
el('#groupSearch').addEventListener('input', renderGroupList);
el('#filterForm').addEventListener('submit', saveFilters);
