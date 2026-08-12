const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const root = path.join(__dirname, '..');

function loadScripts(files, dependencies = {}) {
  const context = { console, ...dependencies };
  for (const relativePath of files) {
    const filename = path.join(root, relativePath);
    vm.runInNewContext(fs.readFileSync(filename, 'utf8'), context, { filename });
  }
  return context;
}

function createFakeLocalStorage(initialEntries = {}) {
  const values = new Map(Object.entries(initialEntries));
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
    valueFor(key) {
      return values.get(key);
    },
  };
}

function emptyBill() {
  return {
    id: 'local-draft',
    participantMode: 'letters',
    participants: [
      { id: 'p1', displayName: 'A' },
      { id: 'p2', displayName: 'B' },
    ],
    expenses: [],
    collectorId: null,
    updatedAt: 1,
  };
}

test('browser draft store persists, loads, and clears a bill as JSON', () => {
  const localStorage = createFakeLocalStorage();
  const context = loadScripts([
    'services/settlement.js',
    'services/draft-store.js',
    'web/storage.js',
  ], { localStorage });
  const store = context.MealSplitStorage.createBrowserDraftStore(localStorage);
  const bill = emptyBill();

  store.save(bill);

  assert.deepEqual(JSON.parse(JSON.stringify(store.load())), bill);
  assert.match(localStorage.valueFor('meal_split_draft'), /"version":1/);
  store.clear();
  assert.equal(store.load(), null);
});

test('browser draft store ignores corrupt JSON and invalid envelopes', () => {
  const localStorage = createFakeLocalStorage({ 'meal_split_draft': '{broken' });
  const context = loadScripts([
    'services/settlement.js',
    'services/draft-store.js',
    'web/storage.js',
  ], { localStorage });
  const store = context.MealSplitStorage.createBrowserDraftStore(localStorage);

  assert.equal(store.load(), null);
  localStorage.setItem('meal_split_draft', JSON.stringify({ version: 99, bill: emptyBill() }));
  assert.equal(store.load(), null);
});

test('clipboard adapter reports browser success and exposes fallback text on failure', async () => {
  const context = loadScripts(['web/clipboard.js']);
  const copied = [];
  const working = context.MealSplitClipboard.createClipboard({
    writeText: async (text) => copied.push(text),
  });
  const workingResult = await working.copy('summary');

  assert.deepEqual(JSON.parse(JSON.stringify(workingResult)), { copied: true, fallbackText: '' });
  assert.deepEqual(copied, ['summary']);

  const unavailable = context.MealSplitClipboard.createClipboard(null);
  assert.deepEqual(JSON.parse(JSON.stringify(await unavailable.copy('manual copy'))), {
    copied: false,
    fallbackText: 'manual copy',
  });
});
