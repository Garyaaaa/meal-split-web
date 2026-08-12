const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const root = path.join(__dirname, '..');

function loadBrowserModule(relativePath, dependencies = {}) {
  const context = { console, ...dependencies };
  const filename = path.join(root, relativePath);
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), context, { filename });
  return context;
}

test('exposes participants domain functions to a browser global', () => {
  const context = loadBrowserModule('domain/participants.js');

  assert.equal(typeof context.MealSplitParticipants.createBill, 'function');
  assert.equal(context.MealSplitParticipants.createBill('letters', 2).participants.length, 2);
});

test('exposes settlement domain functions to a browser global', () => {
  const context = loadBrowserModule('services/settlement.js');
  const bill = {
    participants: [
      { id: 'p1', displayName: 'A' },
      { id: 'p2', displayName: 'B' },
    ],
    expenses: [],
  };

  assert.equal(typeof context.MealSplitSettlement.calculateSettlement, 'function');
  assert.equal(context.MealSplitSettlement.calculateSettlement(bill).totalCents, 0);
});

test('exposes money functions to a browser global', () => {
  const context = loadBrowserModule('utils/money.js');

  assert.equal(typeof context.MealSplitMoney.formatCents, 'function');
  assert.equal(context.MealSplitMoney.formatCents(1250), '12.50');
});

test('exposes share functions to a browser global using browser money dependency', () => {
  const moneyContext = loadBrowserModule('utils/money.js');
  const context = loadBrowserModule('services/share.js', {
    MealSplitMoney: moneyContext.MealSplitMoney,
  });
  const result = {
    totalCents: 1250,
    collectorId: 'p1',
    collectorAmountCents: 625,
    members: [
      { id: 'p1', displayName: 'A' },
      { id: 'p2', displayName: 'B' },
    ],
    transfers: [{ fromId: 'p2', toId: 'p1', amountCents: 625 }],
  };

  assert.equal(typeof context.MealSplitShare.buildShareText, 'function');
  assert.match(context.MealSplitShare.buildShareText(result), /12\.50/);
});
