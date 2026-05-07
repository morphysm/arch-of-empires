// Node.js 18 does not expose `crypto` as a bare global in Vitest's VM context.
// It becomes a stable global in Node 19+. Set it explicitly so source files
// can call crypto.randomUUID() without import statements.
import { webcrypto } from 'node:crypto';
if (typeof globalThis.crypto === 'undefined') {
  globalThis.crypto = webcrypto;
}

// Set up fake IndexedDB globals so the idb library can run in Node.js.
// persistence.test.js replaces indexedDB with a fresh IDBFactory in beforeEach;
// this establishes IDBRequest, IDBKeyRange, etc. that idb needs at import time.
import 'fake-indexeddb/auto';
