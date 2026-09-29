const Database = require('better-sqlite3');
const path = require('path');

function initDb(dbPath) {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'done'
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  return db;
}

function nowIso() {
  return new Date().toISOString();
}

function createNote(db, content) {
  const trimmed = (content || '').trim();
  if (!trimmed) throw new Error('Note content cannot be empty');
  const ts = nowIso();
  const info = db
    .prepare('INSERT INTO notes (content, status, created_at, updated_at) VALUES (?, ?, ?, ?)')
    .run(trimmed, 'pending', ts, ts);
  return getNote(db, info.lastInsertRowid);
}

function getNote(db, id) {
  return db.prepare('SELECT * FROM notes WHERE id = ?').get(id);
}

// Pending notes first (oldest first, so the longest-neglected ones rise to
// the top), then done notes (most recently completed first).
function listNotes(db) {
  const pending = db
    .prepare("SELECT * FROM notes WHERE status = 'pending' ORDER BY created_at ASC")
    .all();
  const done = db
    .prepare("SELECT * FROM notes WHERE status = 'done' ORDER BY updated_at DESC")
    .all();
  return { pending, done };
}

function setNoteStatus(db, id, status) {
  if (status !== 'pending' && status !== 'done') {
    throw new Error('Invalid status');
  }
  const note = getNote(db, id);
  if (!note) throw new Error('Note not found');
  db.prepare('UPDATE notes SET status = ?, updated_at = ? WHERE id = ?').run(
    status,
    nowIso(),
    id
  );
  return getNote(db, id);
}

function deleteNote(db, id) {
  const note = getNote(db, id);
  if (!note) throw new Error('Note not found');
  db.prepare('DELETE FROM notes WHERE id = ?').run(id);
  return { deleted: true };
}

// A pending note is "stale" once it's sat untouched past this many days —
// used client-side to visually flag neglected items.
const STALE_DAYS = 3;

module.exports = {
  initDb,
  createNote,
  getNote,
  listNotes,
  setNoteStatus,
  deleteNote,
  STALE_DAYS,
};
