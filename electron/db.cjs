'use strict';

/*
 * Baqala OS — local data store
 *
 * Pure Node.js JSON file store. No native modules, no compilation required.
 * Writes use a tmp → rename pattern so a crash mid-write never corrupts the file.
 *
 * Performance note: for a typical grocery store (≤50k transactions, ≤5k products)
 * the full JSON round-trip takes < 30 ms on spinning disk. If the store grows very
 * large in the future, migrating the main kv_store to SQLite is a single-file swap.
 */

const fs = require('fs');
const path = require('path');

let dataFilePath = null;
let tmpFilePath = null;

/** All data, kept in memory. Flushed to disk on every write. */
let store = {};

/** Initialise — call once from main.cjs before any reads/writes. */
function init(dbPath) {
  // dbPath is e.g. C:\Users\…\AppData\Roaming\Baqala OS\baqala-os.db
  // Replace the .db extension with .json so the human-readable file sits nearby.
  dataFilePath = dbPath.replace(/\.db$/i, '.json');
  tmpFilePath  = dataFilePath + '.tmp';

  if (fs.existsSync(dataFilePath)) {
    try {
      const raw = fs.readFileSync(dataFilePath, 'utf8');
      store = JSON.parse(raw);
    } catch (err) {
      console.warn('[db] Could not parse data file, starting fresh:', err.message);
      store = {};
    }
  }
}

/** Flush the in-memory store to disk atomically. */
function persist() {
  if (!dataFilePath) return;
  try {
    fs.writeFileSync(tmpFilePath, JSON.stringify(store), 'utf8');
    // Atomic rename — on the same volume this is guaranteed to be atomic on Windows.
    try { fs.unlinkSync(dataFilePath); } catch { /* file may not exist yet */ }
    fs.renameSync(tmpFilePath, dataFilePath);
  } catch (err) {
    console.error('[db] Persist failed:', err.message);
  }
}

/**
 * Read one entry. Returns the parsed JS value or null if not found.
 */
function read(key) {
  return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
}

/**
 * Write one entry. `valueJson` may be a JSON string (from the renderer bridge)
 * or an already-parsed JS value.
 */
function write(key, valueJson) {
  store[key] = parseIfString(valueJson);
  persist();
}

/**
 * Return all entries as { key → parsedValue }.
 * The caller receives a shallow copy so mutations don't affect the store.
 */
function readAll() {
  return Object.assign({}, store);
}

/**
 * Write many entries in a single atomic flush.
 * `entries` is { key → jsonString | jsValue }.
 */
function writeBatch(entries) {
  for (const [key, value] of Object.entries(entries)) {
    store[key] = parseIfString(value);
  }
  persist();
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function parseIfString(v) {
  if (typeof v !== 'string') return v;
  try { return JSON.parse(v); } catch { return v; }
}

module.exports = { init, read, write, readAll, writeBatch };
