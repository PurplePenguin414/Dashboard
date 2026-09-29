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
  // All widgets are visible at once now (no tabs) — load everything up front.
  loadNotes();
  loadTasks();
  loadBudget();
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

// --- Due Today (proxied through this server to Daily Planner) ---

document.getElementById('task-add-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = document.getElementById('task-add-title');
  const title = input.value.trim();
  if (!title) return;
  try {
    await api('/api/due-today', { method: 'POST', body: JSON.stringify({ title }) });
    input.value = '';
    showToast('Added');
    loadTasks();
  } catch (err) {
    showError(err.message);
  }
});

document.getElementById('duetoday-retry').addEventListener('click', loadTasks);

function renderTasks(open, done) {
  const openContainer = document.getElementById('tasks-open');
  const empty = document.getElementById('tasks-empty');
  openContainer.innerHTML = '';
  empty.style.display = open.length ? 'none' : 'block';

  for (const task of open) {
    openContainer.appendChild(buildTaskRow(task, false));
  }

  const doneCard = document.getElementById('tasks-done-card');
  const doneContainer = document.getElementById('tasks-done');
  doneContainer.innerHTML = '';
  doneCard.style.display = done.length ? 'block' : 'none';

  for (const task of done.slice(0, 20)) {
    doneContainer.appendChild(buildTaskRow(task, true));
  }
}

function buildTaskRow(task, isDone) {
  const row = document.createElement('div');
  row.className = 'task-row' + (isDone ? ' done' : '');

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = isDone;
  checkbox.addEventListener('change', () => toggleTaskDone(task.id, checkbox.checked));

  const textWrap = document.createElement('div');
  textWrap.style.flex = '1';
  const title = document.createElement('div');
  title.className = 'task-title';
  title.textContent = task.title;
  textWrap.appendChild(title);
  if (task.notes) {
    const notes = document.createElement('div');
    notes.className = 'task-notes';
    notes.textContent = task.notes;
    textWrap.appendChild(notes);
  }

  const actions = document.createElement('div');
  actions.className = 'note-actions';
  const delBtn = document.createElement('button');
  delBtn.className = 'secondary';
  delBtn.textContent = 'Delete';
  delBtn.addEventListener('click', () => removeTask(task.id));
  actions.appendChild(delBtn);

  row.appendChild(checkbox);
  row.appendChild(textWrap);
  row.appendChild(actions);
  return row;
}

async function loadTasks() {
  const unconfigured = document.getElementById('duetoday-unconfigured');
  const errorCard = document.getElementById('duetoday-error');
  unconfigured.style.display = 'none';
  errorCard.style.display = 'none';
  try {
    const data = await api('/api/due-today');
    renderTasks(data.open || [], data.done || []);
  } catch (err) {
    if (err.message === 'Not authenticated') return;
    if (err.message && err.message.includes('not configured')) {
      unconfigured.style.display = 'block';
    } else {
      errorCard.style.display = 'block';
    }
  }
}

async function toggleTaskDone(id, done) {
  try {
    await api(`/api/due-today/${id}/done`, { method: 'PUT', body: JSON.stringify({ done }) });
    loadTasks();
  } catch (err) {
    showError(err.message);
    loadTasks();
  }
}

async function removeTask(id) {
  try {
    await api(`/api/due-today/${id}`, { method: 'DELETE' });
    showToast('Deleted');
    loadTasks();
  } catch (err) {
    showError(err.message);
  }
}

// --- Budget Snapshot (read-only, proxied through this server) ---

document.getElementById('budget-retry').addEventListener('click', loadBudget);

function formatMoney(n) {
  const sign = n < 0 ? '-' : '';
  return sign + '$' + Math.abs(Math.round(n)).toLocaleString();
}

function renderBudget(data) {
  document.getElementById('budget-income').textContent = formatMoney(data.income);
  document.getElementById('budget-expense').textContent = formatMoney(data.expense);
  const rateEl = document.getElementById('budget-savings-rate');
  rateEl.textContent = `${data.savingsRate}%`;
  rateEl.className = 'budget-stat-value' + (data.savingsRate < 0 ? ' negative' : '');
  document.getElementById('budget-summary').style.display = 'block';

  const attentionCard = document.getElementById('budget-attention-card');
  const attentionList = document.getElementById('budget-attention');
  const onTrack = document.getElementById('budget-ontrack');
  const flagged = (data.needs_attention || []).filter((c) => c.status === 'over' || c.status === 'near');

  attentionList.innerHTML = '';
  if (flagged.length) {
    attentionCard.style.display = 'block';
    onTrack.style.display = 'none';
    for (const cat of flagged) {
      const row = document.createElement('div');
      row.className = 'category-row';

      const name = document.createElement('div');
      name.className = 'category-name';
      name.textContent = cat.name;

      const amounts = document.createElement('div');
      amounts.className = 'category-amounts';
      amounts.textContent = `${formatMoney(cat.actual)} / ${formatMoney(cat.target)}`;

      const pct = document.createElement('div');
      pct.className = 'category-pct ' + cat.status;
      pct.textContent = `${cat.pct}%`;

      row.appendChild(name);
      row.appendChild(amounts);
      row.appendChild(pct);
      attentionList.appendChild(row);
    }
  } else {
    attentionCard.style.display = 'none';
    onTrack.style.display = 'block';
  }
}

async function loadBudget() {
  const unconfigured = document.getElementById('budget-unconfigured');
  const errorCard = document.getElementById('budget-error');
  const summary = document.getElementById('budget-summary');
  const attentionCard = document.getElementById('budget-attention-card');
  const onTrack = document.getElementById('budget-ontrack');
  unconfigured.style.display = 'none';
  errorCard.style.display = 'none';
  try {
    const data = await api('/api/budget-snapshot');
    renderBudget(data);
  } catch (err) {
    if (err.message === 'Not authenticated') return;
    summary.style.display = 'none';
    attentionCard.style.display = 'none';
    onTrack.style.display = 'none';
    if (err.message && err.message.includes('not configured')) {
      unconfigured.style.display = 'block';
    } else {
      errorCard.style.display = 'block';
    }
  }
}

checkSession();
