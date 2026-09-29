const assert = require('assert');
const Database = require('better-sqlite3');
const {
  initDb,
  createNote,
  listNotes,
  setNoteStatus,
  deleteNote,
} = require('../lib/dashboard');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ok - ${name}`);
    passed++;
  } catch (err) {
    console.log(`  FAIL - ${name}`);
    console.log(`    ${err.message}`);
    failed++;
  }
}

function freshDb() {
  return initDb(':memory:');
}

// --- createNote ---
test('createNote stores trimmed content with pending status', () => {
  const db = freshDb();
  const note = createNote(db, '  buy dog food  ');
  assert.strictEqual(note.content, 'buy dog food');
  assert.strictEqual(note.status, 'pending');
  assert.ok(note.created_at);
  assert.ok(note.id);
});

test('createNote rejects empty content', () => {
  const db = freshDb();
  assert.throws(() => createNote(db, '   '), /empty/);
});

test('createNote rejects missing content', () => {
  const db = freshDb();
  assert.throws(() => createNote(db, undefined), /empty/);
});

// --- listNotes ---
test('listNotes returns pending oldest-first, done newest-first', () => {
  const db = freshDb();
  const a = createNote(db, 'first');
  const b = createNote(db, 'second');
  const c = createNote(db, 'third');
  setNoteStatus(db, b.id, 'done');

  const { pending, done } = listNotes(db);
  assert.strictEqual(pending.length, 2);
  assert.strictEqual(pending[0].id, a.id); // oldest pending first
  assert.strictEqual(pending[1].id, c.id);
  assert.strictEqual(done.length, 1);
  assert.strictEqual(done[0].id, b.id);
});

test('listNotes on an empty db returns empty arrays, not an error', () => {
  const db = freshDb();
  const { pending, done } = listNotes(db);
  assert.deepStrictEqual(pending, []);
  assert.deepStrictEqual(done, []);
});

// --- setNoteStatus ---
test('setNoteStatus moves a note from pending to done', () => {
  const db = freshDb();
  const note = createNote(db, 'call the vet');
  const updated = setNoteStatus(db, note.id, 'done');
  assert.strictEqual(updated.status, 'done');
});

test('setNoteStatus can move a done note back to pending', () => {
  const db = freshDb();
  const note = createNote(db, 'call the vet');
  setNoteStatus(db, note.id, 'done');
  const reopened = setNoteStatus(db, note.id, 'pending');
  assert.strictEqual(reopened.status, 'pending');
});

test('setNoteStatus rejects an invalid status value', () => {
  const db = freshDb();
  const note = createNote(db, 'x');
  assert.throws(() => setNoteStatus(db, note.id, 'archived'), /Invalid status/);
});

test('setNoteStatus throws on a missing note id', () => {
  const db = freshDb();
  assert.throws(() => setNoteStatus(db, 9999, 'done'), /not found/i);
});

// --- deleteNote ---
test('deleteNote removes the note', () => {
  const db = freshDb();
  const note = createNote(db, 'temp');
  deleteNote(db, note.id);
  const { pending } = listNotes(db);
  assert.strictEqual(pending.length, 0);
});

test('deleteNote throws on a missing note id', () => {
  const db = freshDb();
  assert.throws(() => deleteNote(db, 9999), /not found/i);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
