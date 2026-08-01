const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const STORAGE_KEY = 'meal_split_draft';
const storage = new Map();
const calls = {
  reLaunch: [],
  navigateTo: [],
  showModal: [],
  showToast: [],
};
let failWrites = false;
let failReads = false;

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

global.wx = {
  getStorageSync(key) {
    if (failReads) {
      throw new Error('storage unavailable');
    }
    return clone(storage.get(key));
  },
  setStorageSync(key, value) {
    if (failWrites) {
      throw new Error('storage full');
    }
    storage.set(key, clone(value));
  },
  removeStorageSync(key) {
    storage.delete(key);
  },
  reLaunch(options) {
    calls.reLaunch.push(options);
  },
  navigateTo(options) {
    calls.navigateTo.push(options);
  },
  showModal(options) {
    calls.showModal.push(options);
  },
  showToast(options) {
    calls.showToast.push(options);
  },
};

let pageDefinition;
global.Page = (definition) => {
  pageDefinition = definition;
};
require('../pages/ledger/ledger');

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
  }, clone(overrides));
}

function expense(id, overrides = {}) {
  return Object.assign({
    id,
    amountCents: 1200,
    payerId: 'p1',
    splitMode: 'all',
    participantIds: [],
    note: '',
  }, clone(overrides));
}

function persist(bill) {
  storage.set(STORAGE_KEY, { version: 1, bill: clone(bill) });
}

function savedBill() {
  return clone(storage.get(STORAGE_KEY).bill);
}

function resetHarness() {
  storage.clear();
  failWrites = false;
  failReads = false;
  for (const callList of Object.values(calls)) {
    callList.length = 0;
  }
}

test('missing draft re-launches the start page', () => {
  resetHarness();
  const page = createPage();

  page.onShow();

  assert.equal(calls.reLaunch.length, 1);
  assert.equal(calls.reLaunch[0].url, '/pages/start/start');
});

test('storage read failure surfaces an error instead of navigating away', () => {
  resetHarness();
  failReads = true;
  const page = createPage();

  page.onShow();

  assert.equal(calls.reLaunch.length, 0);
  assert.match(page.data.pageError, /读取账单失败/);
  assert.equal(calls.showToast.length, 1);
});

test('storage read failure disables stale bill mutations and navigation', () => {
  resetHarness();
  persist(createDraft({ expenses: [expense('e1')] }));
  const page = createPage();
  page.onShow();
  page.openEditExpense({ currentTarget: { dataset: { id: 'e1' } } });
  const original = savedBill();

  failReads = true;
  page.onShow();
  page.saveExpense({ detail: expense('forged', { amountCents: 999 }) });
  page.deleteExpense({ currentTarget: { dataset: { id: 'e1' } } });
  page.editParticipants();
  page.viewResult();

  assert.deepEqual(storage.get(STORAGE_KEY).bill, original);
  assert.equal(calls.showModal.length, 0);
  assert.equal(calls.navigateTo.length, 0);
  assert.equal(page.data.editorVisible, true);
  assert.equal(page.data.expenseCount, 1);
});

test('empty bill renders zero totals, no collector, and a friendly empty state flag', () => {
  resetHarness();
  persist(createDraft());
  const page = createPage();

  page.onShow();

  assert.equal(page.data.participantCount, 3);
  assert.equal(page.data.totalText, '0.00');
  assert.equal(page.data.expenseCount, 0);
  assert.deepEqual(page.data.expenseRows, []);
  assert.equal(page.data.collector, null);
  assert.equal(page.data.hasExpenses, false);
  assert.equal(page.data.pageError, '');
});

test('new saves allocate unique IDs despite repeated time and forged event IDs', () => {
  resetHarness();
  persist(createDraft());
  const page = createPage();
  page.onShow();
  const originalNow = Date.now;
  Date.now = () => 1000;
  try {
    for (let index = 0; index < 2; index += 1) {
      page.openNewExpense();
      page.saveExpense({ detail: {
        id: 'forged-collision',
        amountCents: 500 + index,
        payerId: 'p1',
        splitMode: 'all',
        participantIds: [],
        note: '',
      } });
    }
  } finally {
    Date.now = originalNow;
  }

  const saved = savedBill();
  assert.equal(saved.expenses.length, 2);
  assert.equal(saved.expenses[0].id.trim() !== '', true);
  assert.notEqual(saved.expenses[0].id, saved.expenses[1].id);
  assert.equal(saved.expenses.some((item) => item.id === 'forged-collision'), false);
  assert.equal(page.data.editorVisible, false);
  assert.equal(page.data.expenseCount, 2);
});

test('editing preserves the original ID and cannot overwrite another expense', () => {
  resetHarness();
  persist(createDraft({ expenses: [expense('e1'), expense('e2', { amountCents: 700 })] }));
  const page = createPage();
  page.onShow();

  page.openEditExpense({ currentTarget: { dataset: { id: 'e1' } } });
  assert.equal(page.data.editingExpense.amountInput, '12.00');
  page.saveExpense({ detail: {
    id: 'e2',
    amountCents: 999,
    payerId: 'p2',
    splitMode: 'selected',
    participantIds: ['p2', 'p3'],
    note: 'changed',
  } });

  assert.deepEqual(savedBill().expenses, [
    expense('e1', {
      amountCents: 999,
      payerId: 'p2',
      splitMode: 'selected',
      participantIds: ['p2', 'p3'],
      note: 'changed',
    }),
    expense('e2', { amountCents: 700 }),
  ]);
});

test('a duplicate edit save event is ignored after the editor closes', () => {
  resetHarness();
  persist(createDraft({ expenses: [expense('e1')] }));
  const page = createPage();
  page.onShow();
  page.openEditExpense({ currentTarget: { dataset: { id: 'e1' } } });
  const event = { detail: expense('forged', { amountCents: 999 }) };

  page.saveExpense(event);
  page.saveExpense(event);

  assert.equal(savedBill().expenses.length, 1);
  assert.equal(savedBill().expenses[0].id, 'e1');
  assert.equal(savedBill().expenses[0].amountCents, 999);
});

test('delete cancellation is inert while confirmation persists and refreshes', () => {
  resetHarness();
  persist(createDraft({ expenses: [expense('e1')] }));
  const page = createPage();
  page.onShow();

  page.deleteExpense({ currentTarget: { dataset: { id: 'e1' } } });
  calls.showModal[0].success({ confirm: false, cancel: true });
  assert.equal(savedBill().expenses.length, 1);
  assert.equal(page.data.expenseCount, 1);

  page.deleteExpense({ currentTarget: { dataset: { id: 'e1' } } });
  calls.showModal[1].success({ confirm: true, cancel: false });
  assert.equal(savedBill().expenses.length, 0);
  assert.equal(page.data.expenseCount, 0);
});

test('selected split rows show payer and participant names in bill order', () => {
  resetHarness();
  persist(createDraft({
    expenses: [expense('e1', {
      payerId: 'p2',
      splitMode: 'selected',
      participantIds: ['p3', 'p1'],
      note: '火锅',
    })],
  }));
  const page = createPage();

  page.onShow();

  assert.deepEqual(page.data.expenseRows[0], {
    id: 'e1',
    title: '火锅',
    detail: 'B付款 · A、C承担',
    amountText: '12.00',
  });
});

test('a stale non-positive collector falls back automatically and is persisted once', () => {
  resetHarness();
  persist(createDraft({
    collectorId: 'p2',
    expenses: [expense('e1', { amountCents: 900, payerId: 'p1' })],
  }));
  const page = createPage();
  const originalNow = Date.now;
  Date.now = () => 88;
  try {
    page.onShow();
  } finally {
    Date.now = originalNow;
  }

  assert.equal(page.data.collector.id, 'p1');
  assert.equal(page.data.collector.displayName, 'A');
  assert.equal(page.data.collector.amountText, '6.00');
  assert.equal(savedBill().collectorId, 'p1');
  assert.equal(savedBill().updatedAt, 88);
});

test('storage failure keeps the editor and rendered bill unchanged and surfaces an error', () => {
  resetHarness();
  persist(createDraft());
  const page = createPage();
  page.onShow();
  page.openNewExpense();
  failWrites = true;

  page.saveExpense({ detail: {
    id: 'ignored',
    amountCents: 500,
    payerId: 'p1',
    splitMode: 'all',
    participantIds: [],
    note: '',
  } });

  assert.equal(page.data.editorVisible, true);
  assert.equal(page.data.expenseCount, 0);
  assert.equal(page.data.bill.expenses.length, 0);
  assert.match(page.data.pageError, /保存失败/);
  assert.equal(calls.navigateTo.length, 0);
  assert.equal(calls.showToast.length, 1);
});

test('participant and result navigation obey the empty-expense guard', () => {
  resetHarness();
  persist(createDraft());
  const page = createPage();
  page.onShow();

  page.editParticipants();
  page.viewResult();
  assert.equal(calls.navigateTo.length, 1);
  assert.equal(calls.navigateTo[0].url, '/pages/start/start?edit=1');

  persist(createDraft({ expenses: [expense('e1')] }));
  page.onShow();
  page.viewResult();
  assert.equal(calls.navigateTo[1].url, '/pages/result/result');
});

test('asynchronous navigation and modal failures surface controlled errors', () => {
  resetHarness();
  persist(createDraft({ expenses: [expense('e1')] }));
  const page = createPage();
  page.onShow();

  page.editParticipants();
  assert.equal(typeof calls.navigateTo[0].fail, 'function');
  calls.navigateTo[0].fail(new Error('navigation failed'));
  assert.match(page.data.pageError, /打开参与人设置失败/);

  page.deleteExpense({ currentTarget: { dataset: { id: 'e1' } } });
  assert.equal(typeof calls.showModal[0].fail, 'function');
  calls.showModal[0].fail(new Error('modal failed'));
  assert.match(page.data.pageError, /删除失败/);
});

test('failed missing-draft redirect is surfaced instead of failing silently', () => {
  resetHarness();
  const page = createPage();
  page.onShow();

  assert.equal(typeof calls.reLaunch[0].fail, 'function');
  calls.reLaunch[0].fail(new Error('navigation failed'));
  assert.match(page.data.pageError, /返回开始页失败/);
});

test('templates bind the editor and isolate delete taps; styles avoid unsupported inset', () => {
  const root = path.resolve(__dirname, '..');
  const ledgerWxml = fs.readFileSync(path.join(root, 'pages/ledger/ledger.wxml'), 'utf8');
  const editorWxml = fs.readFileSync(
    path.join(root, 'components/expense-editor/expense-editor.wxml'),
    'utf8',
  );
  const styles = [
    fs.readFileSync(path.join(root, 'pages/ledger/ledger.wxss'), 'utf8'),
    fs.readFileSync(path.join(root, 'components/expense-editor/expense-editor.wxss'), 'utf8'),
  ].join('\n');

  assert.match(ledgerWxml, /<expense-editor[\s\S]*bind:save="saveExpense"[\s\S]*bind:close="closeEditor"/);
  assert.match(ledgerWxml, /catchtap="deleteExpense"/);
  assert.match(editorWxml, /class="editor-mask"[\s\S]*bindtap="close"/);
  assert.match(editorWxml, /class="editor-sheet"[\s\S]*catchtap="stopPropagation"/);
  assert.match(editorWxml, /maxlength="30"/);
  assert.match(ledgerWxml, /aria-role="button"/);
  assert.match(editorWxml, /aria-pressed="{{item\.isPayer}}"/);
  assert.match(editorWxml, /aria-checked="{{item\.isSelected}}"/);
  assert.doesNotMatch(styles, /\binset\s*:/);
});
