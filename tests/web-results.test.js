const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const root = path.join(__dirname, '..');

function loadApp() {
  const context = { console };
  for (const relativePath of [
    'domain/participants.js',
    'utils/money.js',
    'services/settlement.js',
    'services/share.js',
    'web/i18n.js',
    'web/clipboard.js',
    'web/app.js',
  ]) {
    const filename = path.join(root, relativePath);
    vm.runInNewContext(fs.readFileSync(filename, 'utf8'), context, { filename });
  }
  return context;
}

function createDraftStore() {
  let bill = null;
  return {
    load: () => bill,
    save: (nextBill) => { bill = JSON.parse(JSON.stringify(nextBill)); },
    clear: () => { bill = null; },
    current: () => bill,
  };
}

function createApp() {
  const context = loadApp();
  const storage = createDraftStore();
  const app = context.MealSplitApp.createApp({
    storage,
    languageStorage: { getItem: () => 'en', setItem() {} },
    browserLanguage: 'en-US',
  });
  app.createBill('letters', 5);
  app.addExpense({ amount: '398', payerId: 'p1', splitMode: 'all' });
  app.addExpense({ amount: '60', payerId: 'p2', splitMode: 'all' });
  app.addExpense({ amount: '10', payerId: 'p2', splitMode: 'selected', participantIds: ['p3'] });
  return { app, storage };
}

test('calculates the confirmed example and formats dollar amounts', () => {
  const { app } = createApp();

  const result = app.getSettlement();

  assert.equal(result.totalCents, 46800);
  assert.equal(result.collectorId, 'p1');
  assert.equal(app.formatAmount(30640), '$306.40');
  assert.deepEqual(JSON.parse(JSON.stringify(result.transfers.map((transfer) => [transfer.fromId, transfer.toId, transfer.amountCents]))), [
    ['p2', 'p1', 2160],
    ['p3', 'p1', 10160],
    ['p4', 'p1', 9160],
    ['p5', 'p1', 9160],
  ]);
});

test('allows an eligible collector change without changing transfers', () => {
  const { app, storage } = createApp();

  assert.equal(app.changeCollector('p2'), false);
  assert.equal(app.changeCollector('p1'), true);
  assert.equal(storage.current().collectorId, 'p1');
});

test('copies current-language summary with fallback and clears only after confirmation', async () => {
  const { app, storage } = createApp();
  let copied = '';
  app.setClipboard({
    async writeText(text) {
      copied = text;
    },
  });

  assert.deepEqual(JSON.parse(JSON.stringify(await app.copySummary())), { copied: true, fallbackText: '' });
  assert.match(copied, /Meal Split|Total/);
  assert.equal(app.finish(false), false);
  assert.ok(storage.current());
  assert.equal(app.finish(true), true);
  assert.equal(storage.current(), null);
  assert.equal(app.getState().screen, 'start');
});
