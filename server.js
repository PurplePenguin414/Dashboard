require('dotenv').config();
const path = require('path');
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const {
  initDb,
  createNote,
  listNotes,
  setNoteStatus,
  deleteNote,
  STALE_DAYS,
} = require('./lib/dashboard');

const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET;
const APP_PASSWORD_HASH = process.env.APP_PASSWORD_HASH;

if (!SESSION_SECRET || !APP_PASSWORD_HASH) {
  console.error(
    'Missing SESSION_SECRET or APP_PASSWORD_HASH in .env — copy .env.example to .env and fill it in.'
  );
  process.exit(1);
}

const dbPath = path.join(__dirname, 'db', 'dashboard.db');
const db = initDb(dbPath);

const app = express();
app.use(express.json());
app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 * 30 }, // 30 days
  })
);

function requireAuth(req, res, next) {
  if (req.session && req.session.authed) return next();
  return res.status(401).json({ error: 'Not authenticated' });
}

// --- Auth ---
app.post('/api/login', async (req, res) => {
  const { password } = req.body || {};
  if (!password) return res.status(400).json({ error: 'Password required' });
  const ok = await bcrypt.compare(password, APP_PASSWORD_HASH);
  if (!ok) return res.status(401).json({ error: 'Incorrect password' });
  req.session.authed = true;
  res.json({ ok: true });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/session', (req, res) => {
  res.json({ authed: !!(req.session && req.session.authed) });
});

// --- Brain Dump: notes ---
app.get('/api/notes', requireAuth, (req, res) => {
  const { pending, done } = listNotes(db);
  res.json({ pending, done, staleDays: STALE_DAYS });
});

app.post('/api/notes', requireAuth, (req, res) => {
  try {
    const note = createNote(db, req.body && req.body.content);
    res.status(201).json(note);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.patch('/api/notes/:id/status', requireAuth, (req, res) => {
  try {
    const note = setNoteStatus(db, Number(req.params.id), req.body && req.body.status);
    res.json(note);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/notes/:id', requireAuth, (req, res) => {
  try {
    deleteNote(db, Number(req.params.id));
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// --- Due Today: proxies Daily Planner's key-protected external tasks API.
// The API key lives only in this server's .env, never sent to the browser —
// the browser talks to these /api/due-today routes with the normal session
// cookie, and this server forwards to Daily Planner with the real key. ---
function plannerConfigured() {
  return !!(process.env.DAILY_PLANNER_API_URL && process.env.DAILY_PLANNER_API_KEY);
}

function plannerUrl(path) {
  const base = process.env.DAILY_PLANNER_API_URL.replace(/\/$/, '');
  const key = encodeURIComponent(process.env.DAILY_PLANNER_API_KEY);
  const sep = path.includes('?') ? '&' : '?';
  return `${base}${path}${sep}key=${key}`;
}

app.get('/api/due-today', requireAuth, async (req, res) => {
  if (!plannerConfigured()) return res.status(503).json({ error: 'DAILY_PLANNER_API_URL / DAILY_PLANNER_API_KEY not configured in .env' });
  try {
    const response = await fetch(plannerUrl('/api/external/tasks'));
    const body = await response.json();
    if (!response.ok) return res.status(response.status).json(body);
    res.json(body);
  } catch (err) {
    res.status(502).json({ error: 'Could not reach Daily Planner', detail: err.message });
  }
});

app.post('/api/due-today', requireAuth, async (req, res) => {
  if (!plannerConfigured()) return res.status(503).json({ error: 'DAILY_PLANNER_API_URL / DAILY_PLANNER_API_KEY not configured in .env' });
  try {
    const response = await fetch(plannerUrl('/api/external/tasks'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
    });
    const body = await response.json();
    if (!response.ok) return res.status(response.status).json(body);
    res.status(201).json(body);
  } catch (err) {
    res.status(502).json({ error: 'Could not reach Daily Planner', detail: err.message });
  }
});

app.put('/api/due-today/:id', requireAuth, async (req, res) => {
  if (!plannerConfigured()) return res.status(503).json({ error: 'DAILY_PLANNER_API_URL / DAILY_PLANNER_API_KEY not configured in .env' });
  try {
    const response = await fetch(plannerUrl(`/api/external/tasks/${req.params.id}`), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
    });
    const body = await response.json();
    if (!response.ok) return res.status(response.status).json(body);
    res.json(body);
  } catch (err) {
    res.status(502).json({ error: 'Could not reach Daily Planner', detail: err.message });
  }
});

app.put('/api/due-today/:id/done', requireAuth, async (req, res) => {
  if (!plannerConfigured()) return res.status(503).json({ error: 'DAILY_PLANNER_API_URL / DAILY_PLANNER_API_KEY not configured in .env' });
  try {
    const response = await fetch(plannerUrl(`/api/external/tasks/${req.params.id}/done`), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
    });
    const body = await response.json();
    if (!response.ok) return res.status(response.status).json(body);
    res.json(body);
  } catch (err) {
    res.status(502).json({ error: 'Could not reach Daily Planner', detail: err.message });
  }
});

app.delete('/api/due-today/:id', requireAuth, async (req, res) => {
  if (!plannerConfigured()) return res.status(503).json({ error: 'DAILY_PLANNER_API_URL / DAILY_PLANNER_API_KEY not configured in .env' });
  try {
    const response = await fetch(plannerUrl(`/api/external/tasks/${req.params.id}`), { method: 'DELETE' });
    const body = await response.json();
    if (!response.ok) return res.status(response.status).json(body);
    res.json(body);
  } catch (err) {
    res.status(502).json({ error: 'Could not reach Daily Planner', detail: err.message });
  }
});

// --- Budget Snapshot: proxies Budget Dashboard's existing widget/summary
// API (built for its iOS widget, reused as-is — no new API needed). Same
// server-side-key pattern as Due Today: the browser never sees the key. ---
function budgetConfigured() {
  return !!(process.env.BUDGET_API_URL && process.env.BUDGET_API_KEY);
}

app.get('/api/budget-snapshot', requireAuth, async (req, res) => {
  if (!budgetConfigured()) return res.status(503).json({ error: 'BUDGET_API_URL / BUDGET_API_KEY not configured in .env' });
  try {
    const base = process.env.BUDGET_API_URL.replace(/\/$/, '');
    const key = encodeURIComponent(process.env.BUDGET_API_KEY);
    const response = await fetch(`${base}/api/widget/summary?key=${key}`);
    const body = await response.json();
    if (!response.ok) return res.status(response.status).json(body);
    res.json(body);
  } catch (err) {
    res.status(502).json({ error: 'Could not reach Budget Dashboard', detail: err.message });
  }
});

// --- Static frontend ---
app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => {
  console.log(`Dashboard listening on port ${PORT}`);
});
