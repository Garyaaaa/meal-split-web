const test = require('node:test');
const assert = require('node:assert/strict');

const STORAGE_KEY = 'meal_split_draft';
const storage = new Map();
const calls = { navigateTo: [], navigateBack: [] };

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

global.wx = {
  getStorageSync(key) {
    return clone(storage.get(key));
  },
  setStorageSync(key, value) {
    storage.set(key, clone(value));
  },
  removeStorageSync(key) {
    storage.delete(key);
  },
  navigateTo(options) {
    calls.navigateTo.push(options);
  },
  navigateBack(options) {
    calls.navigateBack.push(options);
  },
};

let pageDefinition;
global.Page = (definition) => {
  pageDefinition = definition;
};
require('../pages/start/start');

function createPage() {
  const page = Object.assign({}, pageDefinition);
  page.data = clone(pageDefinition.data);
  page.setData = function setData(patch) {
    Object.assign(this.data, patch);
  };
  return page;
}

function createDraft(overrides = {}) {
  return Object.assign({
    id: 'local-draft',
    participantMode: 'names',
    participants: [
      { id: 'p1', displayName: 'A' },
      { id: 'p2', displayName: 'B' },
      { id: 'p3', displayName: 'C' },
    ],
    expenses: [],
    collectorId: null,
    updatedAt: 1,
  }, overrides);
}

function persist(draft) {
  storage.set(STORAGE_KEY, { version: 1, bill: clone(draft) });
}

function resetHarness() {
  storage.clear();
  calls.navigateTo.length = 0;
  calls.navigateBack.length = 0;
}

test('refreshes draft availability when a cached start page becomes visible again', () => {
  resetHarness();
  const page = createPage();
  page.onLoad({});
  assert.equal(page.data.hasDraft, false);

  persist(createDraft());
  page.onShow();

  assert.equal(page.data.hasDraft, true);
});

test('keeps participant identity when deleting a middle name during editing', () => {
  resetHarness();
  persist(createDraft());
  const page = createPage();
  page.onLoad({ edit: '1' });

  page.removeName({ currentTarget: { dataset: { index: 1 } } });
  page.submit();

  const saved = storage.get(STORAGE_KEY).bill;
  assert.deepEqual(saved.participants, [
    { id: 'p1', displayName: 'A' },
    { id: 'p3', displayName: 'C' },
  ]);
});

test('blocks deleting a middle participant who paid an expense', () => {
  resetHarness();
  const original = createDraft({
    expenses: [{
      id: 'e1',
      amountCents: 1200,
      payerId: 'p2',
      splitMode: 'all',
      participantIds: [],
      note: '',
    }],
  });
  persist(original);
  const page = createPage();
  page.onLoad({ edit: '1' });

  page.removeName({ currentTarget: { dataset: { index: 1 } } });
  page.submit();

  assert.equal(page.data.error, '请先修改 B 付款的消费');
  assert.deepEqual(storage.get(STORAGE_KEY).bill, original);
  assert.equal(calls.navigateBack.length, 0);
});

test('restores temporarily truncated IDs when letter count shrinks then regrows', () => {
  resetHarness();
  const original = createDraft({
    participantMode: 'letters',
    expenses: [{
      id: 'e2',
      amountCents: 900,
      payerId: 'p1',
      splitMode: 'selected',
      participantIds: ['p1', 'p3'],
      note: '',
    }],
  });
  persist(original);
  const page = createPage();
  page.onLoad({ edit: '1' });

  page.updateCount(2);
  assert.equal(page.data.count, 2);
  assert.equal(page.data.names.length, 2);
  assert.deepEqual(page.data.letterChips, ['A', 'B']);
  assert.deepEqual(page.data.participantIds, ['p1', 'p2', 'p3']);

  page.updateCount(3);
  assert.equal(page.data.count, 3);
  assert.equal(page.data.names.length, 3);
  assert.deepEqual(page.data.letterChips, ['A', 'B', 'C']);
  assert.deepEqual(page.data.participantIds, ['p1', 'p2', 'p3']);

  page.submit();

  const saved = storage.get(STORAGE_KEY).bill;
  assert.deepEqual(
    saved.participants.map((participant) => participant.id),
    ['p1', 'p2', 'p3'],
  );
  assert.deepEqual(saved.expenses[0].participantIds, ['p1', 'p3']);
  assert.equal(page.data.error, '');
  assert.equal(calls.navigateBack.length, 1);
  assert.equal(calls.navigateTo.length, 0);
});

test('does not treat a temporarily truncated payer as removed after count regrowth', () => {
  resetHarness();
  const original = createDraft({
    participantMode: 'letters',
    expenses: [{
      id: 'e3',
      amountCents: 900,
      payerId: 'p3',
      splitMode: 'all',
      participantIds: [],
      note: '',
    }],
  });
  persist(original);
  const page = createPage();
  page.onLoad({ edit: '1' });

  page.updateCount(2);
  page.updateCount(3);
  page.submit();

  const saved = storage.get(STORAGE_KEY).bill;
  assert.deepEqual(
    saved.participants.map((participant) => participant.id),
    ['p1', 'p2', 'p3'],
  );
  assert.equal(saved.expenses[0].payerId, 'p3');
  assert.equal(page.data.error, '');
  assert.equal(calls.navigateBack.length, 1);
  assert.equal(calls.navigateTo.length, 0);
});

test('keeps edit intent and blocks submission when the requested draft is unreadable', () => {
  resetHarness();
  const page = createPage();

  page.onLoad({ edit: '1' });

  assert.equal(page.data.editing, true);
  assert.equal(page.data.hasDraft, false);
  assert.equal(page.data.error, '未找到可编辑的账单');

  page.onShow();
  page.submit();

  assert.equal(page.data.editing, true);
  assert.equal(page.data.error, '未找到可编辑的账单');
  assert.equal(storage.has(STORAGE_KEY), false);
  assert.equal(calls.navigateBack.length, 0);
  assert.equal(calls.navigateTo.length, 0);
});
