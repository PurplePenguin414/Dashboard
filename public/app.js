let staleDays = 3;

async function api(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (res.status === 401) {
    showLogin();
    throw new Error('Not authenticated');
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Request failed');
  }
  return res.status === 204 ? null : res.json();
}

function showLogin() {
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('app-shell').style.display = 'none';
}

function showApp() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app-shell').style.display = 'flex';
  loadNotes();
}

async function checkSession() {
  const { authed } = await fetch('/api/session').then((r) => r.json());
  if (authed) showApp();
  else showLogin();
}

document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const password = document.getElementById('login-password').value;
  const errorEl = document.getElementById('login-error');
  errorEl.textContent = '';
  try {
    await api('/api/login', { method: 'POST', body: JSON.stringify({ password }) });
    document.getElementById('login-password').value = '';
    showApp();
  } catch (err) {
    errorEl.textContent = 'Incorrect password';
  }
});

// --- Capture bar (pinned globally, works regardless of active tab) ---
async function submitCapture() {
  const input = document.getElementById('capture-input');
  const content = input.value.trim();
  if (!content) return;
  try {
    await api('/api/notes', { method: 'POST', body: JSON.stringify({ content }) });
    input.value = '';
    showToast('Added');
    loadNotes();
  } catch (err) {
    showError(err.message);
  }
}

document.getElementById('capture-submit').addEventListener('click', submitCapture);
document.getElementById('capture-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') submitCapture();
});

// --- Brain Dump list ---
function daysSince(isoString) {
  const then = new Date(isoString).getTime();
  const now = Date.now();
  return (now - then) / (1000 * 60 * 60 * 24);
}

function formatDate(isoString) {
  const d = new Date(isoString);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
    ' ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function renderPending(notes) {
  const container = document.getElementById('notes-pending');
  const empty = document.getElementById('notes-empty');
  container.innerHTML = '';
  empty.style.display = notes.length ? 'none' : 'block';

  for (const note of notes) {
    const row = document.createElement('div');
    row.className = 'note-row' + (daysSince(note.created_at) >= staleDays ? ' stale' : '');

    const content = document.createElement('div');
    content.className = 'note-content';
    content.textContent = note.content;
    const meta = document.createElement('div');
    meta.className = 'note-meta';
    meta.textContent = formatDate(note.created_at);
    content.appendChild(document.createElement('br'));
    content.appendChild(meta);

    const actions = document.createElement('div');
    actions.className = 'note-actions';

    const doneBtn = document.createElement('button');
    doneBtn.textContent = 'Done';
    doneBtn.addEventListener('click', () => setStatus(note.id, 'done'));

    const delBtn = document.createElement('button');
    delBtn.className = 'secondary';
    delBtn.textContent = 'Delete';
    delBtn.addEventListener('click', () => removeNote(note.id));

    actions.appendChild(doneBtn);
    actions.appendChild(delBtn);

    row.appendChild(content);
    row.appendChild(actions);
    container.appendChild(row);
  }
}

function renderDone(notes) {
  const card = document.getElementById('notes-done-card');
  const container = document.getElementById('notes-done');
  container.innerHTML = '';
  card.style.display = notes.length ? 'block' : 'none';

  for (const note of notes.slice(0, 20)) {
    const row = document.createElement('div');
    row.className = 'note-row';

    const content = document.createElement('div');
    content.className = 'note-content';
    content.style.color = 'var(--muted)';
    content.style.textDecoration = 'line-through';
    content.textContent = note.content;

    const actions = document.createElement('div');
    actions.className = 'note-actions';

    const delBtn = document.createElement('button');
    delBtn.className = 'secondary';
    delBtn.textContent = 'Delete';
    delBtn.addEventListener('click', () => removeNote(note.id));

    actions.appendChild(delBtn);
    row.appendChild(content);
    row.appendChild(actions);
    container.appendChild(row);
  }
}

async function loadNotes() {
  try {
    const data = await api('/api/notes');
    staleDays = data.staleDays || 3;
    renderPending(data.pending);
    renderDone(data.done);
  } catch (err) {
    if (err.message !== 'Not authenticated') showError(err.message);
  }
}

async function setStatus(id, status) {
  try {
    await api(`/api/notes/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    loadNotes();
  } catch (err) {
    showError(err.message);
  }
}

async function removeNote(id) {
  try {
    await api(`/api/notes/${id}`, { method: 'DELETE' });
    loadNotes();
  } catch (err) {
    showError(err.message);
  }
}

checkSession();
