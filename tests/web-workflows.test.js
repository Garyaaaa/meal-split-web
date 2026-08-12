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
    'web/i18n.js',
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
  app.createBill('letters', 3);
  return { app, storage };
}

test('adds an all-participants expense and saves the normalized record', () => {
  const { app, storage } = createApp();

  assert.equal(app.addExpense({ amount: '12.50', payerId: 'p1', splitMode: 'all', note: 'Lunch' }), true);

  const expense = storage.current().expenses[0];
  assert.equal(expense.amountCents, 1250);
  assert.equal(expense.payerId, 'p1');
  assert.equal(expense.splitMode, 'all');
  assert.deepEqual(expense.participantIds, []);
  assert.equal(expense.note, 'Lunch');
});

test('edits an expense and supports a selected participant split', () => {
  const { app, storage } = createApp();
  app.addExpense({ amount: '12.50', payerId: 'p1', splitMode: 'all' });
  const expenseId = storage.current().expenses[0].id;

  assert.equal(app.editExpense(expenseId, {
    amount: '20',
    payerId: 'p2',
    splitMode: 'selected',
    participantIds: ['p1', 'p3'],
    note: 'Tickets',
  }), true);

  assert.deepEqual(storage.current().expenses, [{
    id: expenseId,
    amountCents: 2000,
    payerId: 'p2',
    splitMode: 'selected',
    participantIds: ['p1', 'p3'],
    note: 'Tickets',
  }]);
});

test('deletes an expense and rejects invalid input without mutating the bill', () => {
  const { app, storage } = createApp();
  app.addExpense({ amount: '12.50', payerId: 'p1', splitMode: 'all' });
  const expenseId = storage.current().expenses[0].id;
  const before = JSON.stringify(storage.current());

  assert.equal(app.addExpense({ amount: '0', payerId: 'p1', splitMode: 'all' }), false);
  assert.match(app.getState().error, /positive amount/);
  assert.equal(JSON.stringify(storage.current()), before);
  assert.equal(app.deleteExpense(expenseId), true);
  assert.equal(storage.current().expenses.length, 0);
});
