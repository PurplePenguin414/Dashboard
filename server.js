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

// --- Static frontend ---
app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => {
  console.log(`Dashboard listening on port ${PORT}`);
});
