import { openDB } from 'idb';

const DB_NAME = 'arch-of-empires';
const DB_VERSION = 1;

let _db = null;

async function getDB() {
  if (!_db) {
    _db = await openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        db.createObjectStore('clockState');
        db.createObjectStore('ghostSignals', { autoIncrement: true });
      },
    });
  }
  return _db;
}

export async function saveClock(clockSlice) {
  const db = await getDB();
  await db.put('clockState', clockSlice, 'current');
}

export async function loadClock() {
  const db = await getDB();
  return (await db.get('clockState', 'current')) ?? null;
}

export async function saveGhostSignal(entry) {
  const db = await getDB();
  await db.add('ghostSignals', entry);
}

export async function loadGhostSignals() {
  const db = await getDB();
  return db.getAll('ghostSignals');
}

export async function saveLastCommand(commandString) {
  const db = await getDB();
  await db.put('clockState', commandString, 'lastCommand');
}

export async function loadLastCommand() {
  const db = await getDB();
  return (await db.get('clockState', 'lastCommand')) ?? null;
}

export async function saveCurrentShift(shiftNum) {
  const db = await getDB();
  await db.put('clockState', shiftNum, 'currentShift');
}

export async function loadCurrentShift() {
  const db = await getDB();
  return (await db.get('clockState', 'currentShift')) ?? null;
}

// Resets the DB singleton so tests can inject a fresh IDBFactory
export function _resetDB() {
  _db = null;
}
