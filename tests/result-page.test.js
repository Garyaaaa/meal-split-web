const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const STORAGE_KEY = 'meal_split_draft';
const storage = new Map();
const calls = {
  reLaunch: [],
  navigateBack: [],
  showModal: [],
  showToast: [],
  setClipboardData: [],
};
let failReads = false;
let failWrites = false;
let failClears = false;
let modalThrows = false;
let navigateBackThrows = false;
let reLaunchThrows = false;
let clipboardThrows = false;

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
    if (failClears) {
      throw new Error('storage locked');
    }
    storage.delete(key);
  },
  reLaunch(options) {
    if (reLaunchThrows) {
      throw new Error('reLaunch threw');
    }
    calls.reLaunch.push(options);
  },
  navigateBack(options) {
    if (navigateBackThrows) {
      throw new Error('navigateBack threw');
    }
    calls.navigateBack.push(options);
  },
  showModal(options) {
    if (modalThrows) {
      throw new Error('modal threw');
    }
    calls.showModal.push(options);
  },
  showToast(options) {
    calls.showToast.push(options);
  },
  setClipboardData(options) {
    if (clipboardThrows) {
      throw new Error('clipboard threw');
    }
    calls.setClipboardData.push(options);
  },
};

let pageDefinition;
global.Page = (definition) => {
  pageDefinition = definition;
};
require('../pages/result/result');

function createPage() {
  const page = Object.assign({}, pageDefinition);
  page.data = clone(pageDefinition.data);
  page.setData = function setData(patch) {
    Object.assign(this.data, patch);
  };
  return page;
}

function participants(count = 5) {
  return Array.from({ length: count }, (_, index) => ({
    id: `p${index + 1}`,
    displayName: String.fromCharCode(65 + index),
  }));
}

function expense(id, amountCents, payerId, overrides = {}) {
  return Object.assign({
    id,
    amountCents,
    payerId,
    splitMode: 'all',
    participantIds: [],
    note: '',
  }, clone(overrides));
}

function createDraft(overrides = {}) {
  return Object.assign({
    id: 'local-draft',
    participantMode: 'names',
    participants: participants(),
    expenses: [expense('e1', 1000, 'p1')],
    collectorId: null,
    updatedAt: 1,
  }, clone(overrides));
}

function persist(bill) {
  storage.set(STORAGE_KEY, { version: 1, bill: clone(bill) });
}

function savedBill() {
  const envelope = storage.get(STORAGE_KEY);
  return envelope && clone(envelope.bill);
}

function resetHarness() {
  storage.clear();
  failReads = false;
  failWrites = false;
  failClears = false;
  modalThrows = false;
  navigateBackThrows = false;
  reLaunchThrows = false;
  clipboardThrows = false;
  for (const callList of Object.values(calls)) {
    callList.length = 0;
  }
}

function caseOneBill(overrides = {}) {
  return createDraft(Object.assign({
    expenses: [
      expense('e1', 39800, 'p1', { note: '正餐' }),
      expense('e2', 6000, 'p2'),
      expense('e3', 1000, 'p2', {
        splitMode: 'selected',
        participantIds: ['p3'],
        note: 'C 加菜',
      }),
    ],
  }, overrides));
}

function multipleCreditorsBill(overrides = {}) {
  return createDraft(Object.assign({
    participants: participants(3),
    expenses: [
      expense('e1', 9000, 'p1'),
      expense('e2', 6000, 'p2'),
    ],
  }, overrides));
}

test('maps the confirmed five-person 398/60/10 example exactly', () => {
  resetHarness();
  persist(caseOneBill());
  const page = createPage();

  page.onShow();

  assert.equal(page.data.isReady, true);
  assert.equal(page.data.totalText, '468.00');
  assert.equal(page.data.participantCount, 5);
  assert.deepEqual(page.data.collector, {
    id: 'p1',
    displayName: 'A',
    initial: 'A',
    amountText: '306.40',
  });
  assert.deepEqual(
    page.data.actionRows.map(({ key, routeText, amountText }) => ({
      key,
      routeText,
      amountText,
    })),
    [
      { key: '2:p2|2:p1', routeText: 'B 转给 A', amountText: '21.60' },
      { key: '2:p3|2:p1', routeText: 'C 转给 A', amountText: '101.60' },
      { key: '2:p4|2:p1', routeText: 'D 转给 A', amountText: '91.60' },
      { key: '2:p5|2:p1', routeText: 'E 转给 A', amountText: '91.60' },
    ],
  );
  assert.equal(page.data.actionRows[1].detail, '承担 C 加菜');
  assert.equal(page.data.actionRows[0].detail, '应承担 ¥91.60 · 已付 ¥70.00');
  assert.equal(page.data.actionRows[3].detail, '应承担 ¥91.60');
});

test('maps the confirmed five-person 390/60/50 example exactly', () => {
  resetHarness();
  persist(createDraft({
    expenses: [
      expense('e1', 39000, 'p1'),
      expense('e2', 6000, 'p2'),
      expense('e3', 5000, 'p3', {
        splitMode: 'selected',
        participantIds: ['p1', 'p2', 'p3'],
        note: '',
      }),
    ],
  }));
  const page = createPage();

  page.onShow();

  assert.equal(page.data.totalText, '500.00');
  assert.equal(page.data.collector.amountText, '283.33');
  assert.deepEqual(
    page.data.actionRows.map((row) => `${row.routeText} ¥${row.amountText}`),
    ['B 转给 A ¥46.67', 'C 转给 A ¥56.66', 'D 转给 A ¥90.00', 'E 转给 A ¥90.00'],
  );
});

test('renders every multiple-creditor transfer with stable route keys', () => {
  resetHarness();
  persist(multipleCreditorsBill());
  const page = createPage();

  page.onShow();

  assert.deepEqual(page.data.eligibleCollectors.map((item) => item.id), ['p1', 'p2']);
  assert.deepEqual(
    page.data.actionRows.map((row) => ({
      key: row.key,
      from: row.fromName,
      to: row.toName,
      amount: row.amountText,
    })),
    [
      { key: '2:p1|2:p2', from: 'A', to: 'B', amount: '10.00' },
      { key: '2:p3|2:p1', from: 'C', to: 'A', amount: '50.00' },
    ],
  );
  assert.equal(new Set(page.data.actionRows.map((row) => row.key)).size, 2);
  assert.equal(page.data.actionRows.some((row) => row.fromId === page.data.collector.id), true);
});

test('transfer row keys are injective for adversarial valid participant IDs', () => {
  resetHarness();
  persist(createDraft({
    participants: [
      { id: 'a', displayName: 'A' },
      { id: 'b-to-a', displayName: 'B' },
      { id: 'a-to-b', displayName: 'C' },
    ],
    expenses: [
      expense('e1', 9000, 'a'),
      expense('e2', 6000, 'b-to-a'),
    ],
  }));
  const page = createPage();

  page.onShow();

  assert.deepEqual(
    page.data.actionRows.map((row) => row.key),
    ['1:a|6:b-to-a', '6:a-to-b|1:a'],
  );
  assert.equal(new Set(page.data.actionRows.map((row) => row.key)).size, 2);
});

test('action detail uses at most two relevant nonblank selected-expense notes', () => {
  resetHarness();
  persist(createDraft({
    participants: participants(2),
    expenses: [
      expense('e1', 1000, 'p1', {
        splitMode: 'selected', participantIds: ['p2'], note: '甜品',
      }),
      expense('e2', 1000, 'p1', {
        splitMode: 'selected', participantIds: ['p2'], note: ' 饮料 ',
      }),
      expense('e3', 1000, 'p1', {
        splitMode: 'selected', participantIds: ['p2'], note: '不应显示',
      }),
      expense('e4', 1000, 'p1', { note: '全员消费不作标签' }),
    ],
  }));
  const page = createPage();

  page.onShow();

  assert.equal(page.data.actionRows[0].detail, '承担 甜品、饮料');
  assert.doesNotMatch(page.data.actionRows[0].detail, /不应显示|全员消费/);
});

test('renders the settled state with no collector or transfer rows', () => {
  resetHarness();
  persist(createDraft({
    participants: participants(2),
    expenses: [
      expense('e1', 1000, 'p1', {
        splitMode: 'selected', participantIds: ['p1'],
      }),
      expense('e2', 1000, 'p2', {
        splitMode: 'selected', participantIds: ['p2'],
      }),
    ],
  }));
  const page = createPage();

  page.onShow();

  assert.equal(page.data.isSettled, true);
  assert.equal(page.data.collector, null);
  assert.deepEqual(page.data.eligibleCollectors, []);
  assert.deepEqual(page.data.actionRows, []);
  assert.equal(page.data.isReady, true);
});

test('falls back from a non-positive collector and persists before rendering', () => {
  resetHarness();
  persist(caseOneBill({ collectorId: 'p2' }));
  const page = createPage();
  const originalNow = Date.now;
  Date.now = () => 88;
  try {
    page.onShow();
  } finally {
    Date.now = originalNow;
  }

  assert.equal(savedBill().collectorId, 'p1');
  assert.equal(savedBill().updatedAt, 88);
  assert.equal(page.data.collector.id, 'p1');
  assert.equal(page.data.isReady, true);
});

test('recovers an unknown stored collector and persists the resolved positive member', () => {
  resetHarness();
  persist(caseOneBill({ collectorId: 'missing-participant' }));
  const page = createPage();
  const originalNow = Date.now;
  Date.now = () => 89;
  try {
    page.onShow();
  } finally {
    Date.now = originalNow;
  }

  assert.equal(calls.reLaunch.length, 0);
  assert.equal(page.data.isReady, true);
  assert.equal(page.data.collector.id, 'p1');
  assert.equal(savedBill().collectorId, 'p1');
  assert.equal(savedBill().updatedAt, 89);
});

test('persists a recovered unknown collector as null for a settled bill', () => {
  resetHarness();
  persist(createDraft({
    participants: participants(2),
    collectorId: 'missing-participant',
    expenses: [
      expense('e1', 1000, 'p1', {
        splitMode: 'selected', participantIds: ['p1'],
      }),
      expense('e2', 1000, 'p2', {
        splitMode: 'selected', participantIds: ['p2'],
      }),
    ],
  }));
  const page = createPage();
  const originalNow = Date.now;
  Date.now = () => 90;
  try {
    page.onShow();
  } finally {
    Date.now = originalNow;
  }

  assert.equal(page.data.isSettled, true);
  assert.equal(savedBill().collectorId, null);
  assert.equal(savedBill().updatedAt, 90);
});

test('collector fallback persistence failure exposes no ready or stale action state', () => {
  resetHarness();
  persist(caseOneBill({ collectorId: 'p2' }));
  failWrites = true;
  const page = createPage();

  page.onShow();

  assert.equal(page.data.isReady, false);
  assert.equal(page.data.bill, null);
  assert.equal(page.data.collector, null);
  assert.deepEqual(page.data.actionRows, []);
  assert.match(page.data.pageError, /保存收款人失败/);
  page.copyResult();
  page.changeCollector({ currentTarget: { dataset: { id: 'p1' } } });
  assert.equal(calls.setClipboardData.length, 0);
});

test('changeCollector accepts only another eligible positive-net member', () => {
  resetHarness();
  persist(multipleCreditorsBill());
  const page = createPage();
  page.onShow();
  const original = savedBill();

  page.changeCollector({ currentTarget: { dataset: { id: 'p1' } } });
  page.changeCollector({ currentTarget: { dataset: { id: 'p3' } } });
  page.changeCollector({ currentTarget: { dataset: { id: 'forged' } } });
  assert.deepEqual(savedBill(), original);

  const originalNow = Date.now;
  Date.now = () => 99;
  try {
    page.changeCollector({ currentTarget: { dataset: { id: 'p2' } } });
  } finally {
    Date.now = originalNow;
  }

  assert.equal(savedBill().collectorId, 'p2');
  assert.equal(savedBill().updatedAt, 99);
  assert.equal(page.data.collector.id, 'p2');
  assert.deepEqual(
    page.data.actionRows.map((row) => row.key),
    ['2:p2|2:p1', '2:p3|2:p2'],
  );
});

test('changeCollector storage failure leaves the prior rendered and private result', () => {
  resetHarness();
  persist(multipleCreditorsBill());
  const page = createPage();
  page.onShow();
  const beforeData = clone(page.data);
  failWrites = true;

  page.changeCollector({ currentTarget: { dataset: { id: 'p2' } } });

  assert.equal(page.data.collector.id, beforeData.collector.id);
  assert.deepEqual(page.data.actionRows, beforeData.actionRows);
  assert.equal(savedBill().collectorId, 'p1');
  assert.match(page.data.pageError, /更换收款人失败/);
  failWrites = false;
  page.copyResult();
  assert.match(calls.setClipboardData[0].data, /主收款人 A 应收 ¥40\.00/);
});

test('copyResult copies the exact current settlement and reports success', () => {
  resetHarness();
  persist(multipleCreditorsBill());
  const page = createPage();
  page.onShow();
  page.changeCollector({ currentTarget: { dataset: { id: 'p2' } } });

  page.copyResult();
  page.copyResult();

  assert.equal(calls.setClipboardData.length, 1);
  assert.equal(
    calls.setClipboardData[0].data,
    '【吃饭分账】总消费 ¥150.00\n'
      + '主收款人 B 应收 ¥10.00\n\n'
      + 'B → A：¥40.00\n'
      + 'C → B：¥50.00',
  );
  calls.setClipboardData[0].success();
  assert.deepEqual(calls.showToast.at(-1), { title: '已复制到剪贴板', icon: 'success' });
});

test('copyResult handles callback and synchronous clipboard failures', () => {
  resetHarness();
  persist(caseOneBill());
  const page = createPage();
  page.onShow();

  page.copyResult();
  calls.setClipboardData[0].fail(new Error('denied'));
  assert.match(page.data.pageError, /复制失败/);

  clipboardThrows = true;
  page.copyResult();
  assert.match(page.data.pageError, /复制失败/);
  assert.equal(calls.showToast.filter((item) => item.title === '复制失败').length, 2);
});

test('stale clipboard success after onShow cannot unlock or toast over the current request', () => {
  resetHarness();
  persist(caseOneBill());
  const page = createPage();
  page.onShow();
  page.copyResult();
  const firstRequest = calls.setClipboardData[0];

  page.onShow();
  page.copyResult();
  const secondRequest = calls.setClipboardData[1];
  firstRequest.success();
  page.copyResult();

  assert.equal(calls.setClipboardData.length, 2);
  assert.equal(calls.showToast.some((item) => item.title === '已复制到剪贴板'), false);

  secondRequest.success();
  page.copyResult();
  assert.equal(calls.setClipboardData.length, 3);
  assert.equal(
    calls.showToast.filter((item) => item.title === '已复制到剪贴板').length,
    1,
  );
});

test('stale clipboard failure after onShow cannot unlock or overwrite current state', () => {
  resetHarness();
  persist(caseOneBill());
  const page = createPage();
  page.onShow();
  page.copyResult();
  const firstRequest = calls.setClipboardData[0];

  page.onShow();
  page.copyResult();
  const secondRequest = calls.setClipboardData[1];
  firstRequest.fail(new Error('stale failure'));
  page.copyResult();

  assert.equal(calls.setClipboardData.length, 2);
  assert.equal(page.data.pageError, '');
  assert.equal(calls.showToast.some((item) => item.title === '复制失败'), false);

  secondRequest.fail(new Error('current failure'));
  assert.match(page.data.pageError, /复制失败/);
  page.copyResult();
  assert.equal(calls.setClipboardData.length, 3);
});

test('finish cancellation does not clear or navigate and allows retry', () => {
  resetHarness();
  persist(caseOneBill());
  const page = createPage();
  page.onShow();

  page.finish();
  page.finish();
  assert.equal(calls.showModal.length, 1);
  assert.equal(calls.showModal[0].title, '开始一笔新账单？');
  assert.match(calls.showModal[0].content, /当前本地账单将被清除/);
  assert.equal(calls.showModal[0].confirmText, '清除账单');
  assert.ok(Array.from(calls.showModal[0].confirmText).length <= 4);
  calls.showModal[0].success({ confirm: false, cancel: true });
  assert.ok(savedBill());
  assert.equal(calls.reLaunch.length, 0);

  page.finish();
  assert.equal(calls.showModal.length, 2);
});

test('finish confirmation from an older onShow generation cannot clear a reloaded draft', () => {
  resetHarness();
  persist(caseOneBill());
  const page = createPage();
  page.onShow();
  page.finish();
  const oldModal = calls.showModal[0];

  persist(caseOneBill({
    collectorId: 'p1',
    updatedAt: 501,
    expenses: [expense('replacement', 2500, 'p1')],
  }));
  page.onShow();
  const replacement = savedBill();
  oldModal.success({ confirm: true, cancel: false });

  assert.deepEqual(savedBill(), replacement);
  assert.equal(calls.reLaunch.length, 0);
  assert.equal(page.data.isReady, true);
  assert.equal(page.data.totalText, '25.00');
});

test('stale finish failure cannot unlock or overwrite the current modal request', () => {
  resetHarness();
  persist(caseOneBill());
  const page = createPage();
  page.onShow();
  page.finish();
  const oldModal = calls.showModal[0];

  page.onShow();
  page.finish();
  const currentModal = calls.showModal[1];
  oldModal.fail(new Error('stale modal failure'));
  page.finish();

  assert.equal(calls.showModal.length, 2);
  assert.equal(page.data.pageError, '');
  assert.equal(calls.showToast.some((item) => item.title === '打开确认提示失败'), false);

  currentModal.fail(new Error('current modal failure'));
  assert.match(page.data.pageError, /打开确认提示失败/);
  page.finish();
  assert.equal(calls.showModal.length, 3);
});

test('finish rechecks storage and preserves an externally replaced draft', () => {
  resetHarness();
  persist(caseOneBill());
  const page = createPage();
  page.onShow();
  page.finish();
  const modal = calls.showModal[0];
  const replacement = caseOneBill({
    collectorId: 'p1',
    updatedAt: 777,
    expenses: [expense('external', 3300, 'p2')],
  });
  persist(replacement);

  modal.success({ confirm: true, cancel: false });

  assert.deepEqual(savedBill(), replacement);
  assert.equal(calls.reLaunch.length, 0);
  assert.match(page.data.pageError, /账单已更新，请重新确认/);
});

test('finish storage read failure preserves the draft and does not navigate', () => {
  resetHarness();
  persist(caseOneBill());
  const page = createPage();
  page.onShow();
  page.finish();
  failReads = true;

  calls.showModal[0].success({ confirm: true, cancel: false });

  assert.ok(savedBill());
  assert.equal(calls.reLaunch.length, 0);
  assert.match(page.data.pageError, /读取账单失败/);
});

test('finish treats a missing draft at confirmation time as updated', () => {
  resetHarness();
  persist(caseOneBill());
  const page = createPage();
  page.onShow();
  page.finish();
  storage.delete(STORAGE_KEY);

  calls.showModal[0].success({ confirm: true, cancel: false });

  assert.equal(calls.reLaunch.length, 0);
  assert.match(page.data.pageError, /账单已更新，请重新确认/);
});

test('late finish relaunch failure cannot overwrite a newer page generation', () => {
  resetHarness();
  persist(caseOneBill());
  const page = createPage();
  page.onShow();
  page.finish();
  calls.showModal[0].success({ confirm: true, cancel: false });
  const oldRelaunch = calls.reLaunch[0];

  persist(caseOneBill({
    collectorId: 'p1',
    updatedAt: 808,
    expenses: [expense('new-generation', 4400, 'p1')],
  }));
  page.onShow();
  oldRelaunch.fail(new Error('stale relaunch failure'));

  assert.equal(page.data.isReady, true);
  assert.equal(page.data.totalText, '44.00');
  assert.equal(page.data.pageError, '');
  assert.equal(calls.showToast.some((item) => item.title === '返回开始页失败'), false);
});

test('finish confirm clears then relaunches once despite duplicate callbacks', () => {
  resetHarness();
  persist(caseOneBill());
  const page = createPage();
  page.onShow();

  page.finish();
  const callback = calls.showModal[0].success;
  callback({ confirm: true, cancel: false });
  callback({ confirm: true, cancel: false });

  assert.equal(storage.has(STORAGE_KEY), false);
  assert.equal(calls.reLaunch.length, 1);
  assert.equal(calls.reLaunch[0].url, '/pages/start/start');
});

test('finish clear failure keeps the bill and does not navigate', () => {
  resetHarness();
  persist(caseOneBill());
  const page = createPage();
  page.onShow();
  failClears = true;

  page.finish();
  calls.showModal[0].success({ confirm: true, cancel: false });

  assert.ok(savedBill());
  assert.equal(calls.reLaunch.length, 0);
  assert.match(page.data.pageError, /清除账单失败/);
});

test('finish surfaces modal and relaunch failures and unlocks safely', () => {
  resetHarness();
  persist(caseOneBill());
  const page = createPage();
  page.onShow();
  modalThrows = true;
  page.finish();
  assert.match(page.data.pageError, /打开确认提示失败/);

  modalThrows = false;
  page.finish();
  assert.equal(calls.showModal.length, 1);
  reLaunchThrows = true;
  calls.showModal[0].success({ confirm: true, cancel: false });
  assert.match(page.data.pageError, /返回开始页失败/);
  assert.equal(page.data.isReady, false);
  assert.equal(page.data.bill, null);
  assert.deepEqual(page.data.actionRows, []);
  page.changeCollector({ currentTarget: { dataset: { id: 'p2' } } });
  assert.equal(storage.has(STORAGE_KEY), false);

  persist(caseOneBill());
  page.onShow();
  reLaunchThrows = false;
  page.finish();
  calls.showModal[1].success({ confirm: true, cancel: false });
  calls.reLaunch[0].fail(new Error('failed'));
  assert.match(page.data.pageError, /返回开始页失败/);
});

test('returnToLedger guards rapid taps and resets after a failed fallback', () => {
  resetHarness();
  persist(caseOneBill());
  const page = createPage();
  page.onShow();

  page.returnToLedger();
  page.returnToLedger();
  assert.equal(calls.navigateBack.length, 1);
  calls.navigateBack[0].fail(new Error('no back stack'));
  assert.equal(calls.reLaunch.length, 1);
  assert.equal(calls.reLaunch[0].url, '/pages/ledger/ledger');
  calls.reLaunch[0].fail(new Error('fallback failed'));
  calls.reLaunch[0].fail(new Error('duplicate failure'));
  assert.match(page.data.pageError, /返回账单失败/);

  page.returnToLedger();
  assert.equal(calls.navigateBack.length, 2);
});

test('returnToLedger handles a synchronous back failure with the same safe fallback', () => {
  resetHarness();
  persist(caseOneBill());
  const page = createPage();
  page.onShow();
  navigateBackThrows = true;

  page.returnToLedger();

  assert.equal(calls.reLaunch.length, 1);
  assert.equal(calls.reLaunch[0].url, '/pages/ledger/ledger');
});

test('missing and empty drafts route safely without exposing actions', () => {
  resetHarness();
  const page = createPage();
  page.onShow();
  assert.equal(calls.reLaunch[0].url, '/pages/start/start');
  assert.equal(page.data.isReady, false);
  page.copyResult();
  page.finish();
  assert.equal(calls.setClipboardData.length, 0);
  assert.equal(calls.showModal.length, 0);

  resetHarness();
  persist(createDraft({ expenses: [] }));
  page.onShow();
  assert.equal(calls.reLaunch[0].url, '/pages/ledger/ledger');
  assert.equal(page.data.isReady, false);
  assert.deepEqual(page.data.actionRows, []);
});

test('an invalid stored draft routes to start with no unsafe state', () => {
  resetHarness();
  storage.set(STORAGE_KEY, {
    version: 1,
    bill: createDraft({ participants: [{ id: 'p1', displayName: 'A' }] }),
  });
  const page = createPage();

  page.onShow();

  assert.equal(calls.reLaunch[0].url, '/pages/start/start');
  assert.equal(page.data.isReady, false);
  assert.equal(page.data.collector, null);
  assert.deepEqual(page.data.actionRows, []);
});

test('collector recovery does not repair missing draft metadata', () => {
  resetHarness();
  const bill = caseOneBill();
  delete bill.collectorId;
  storage.set(STORAGE_KEY, { version: 1, bill });
  const page = createPage();

  page.onShow();

  assert.equal(calls.reLaunch[0].url, '/pages/start/start');
  assert.equal(page.data.isReady, false);
  assert.equal(storage.get(STORAGE_KEY).bill.collectorId, undefined);
});

test('storage read errors disable stale state and surface a controlled error', () => {
  resetHarness();
  persist(caseOneBill());
  const page = createPage();
  page.onShow();
  assert.equal(page.data.isReady, true);
  failReads = true;

  page.onShow();
  page.copyResult();
  page.finish();
  page.changeCollector({ currentTarget: { dataset: { id: 'p1' } } });

  assert.equal(calls.reLaunch.length, 0);
  assert.equal(page.data.isReady, false);
  assert.equal(page.data.bill, null);
  assert.deepEqual(page.data.actionRows, []);
  assert.match(page.data.pageError, /读取账单失败/);
  assert.equal(calls.setClipboardData.length, 0);
  assert.equal(calls.showModal.length, 0);
});

test('failed redirects surface controlled errors without enabling the page', () => {
  resetHarness();
  const page = createPage();
  page.onShow();
  calls.reLaunch[0].fail(new Error('navigation failed'));
  assert.match(page.data.pageError, /返回开始页失败/);
  assert.equal(page.data.isReady, false);
});

test('onShow resets in-flight action guards after returning to the page', () => {
  resetHarness();
  persist(caseOneBill());
  const page = createPage();
  page.onShow();
  page.copyResult();
  page.returnToLedger();
  page.finish();
  assert.equal(calls.setClipboardData.length, 1);
  assert.equal(calls.navigateBack.length, 1);
  assert.equal(calls.showModal.length, 1);

  page.onShow();
  page.copyResult();
  page.returnToLedger();
  page.finish();
  assert.equal(calls.setClipboardData.length, 2);
  assert.equal(calls.navigateBack.length, 2);
  assert.equal(calls.showModal.length, 2);
});

test('template bindings, stable keys, and accessibility are safe', () => {
  const root = path.resolve(__dirname, '..');
  const wxml = fs.readFileSync(path.join(root, 'pages/result/result.wxml'), 'utf8');
  const wxss = fs.readFileSync(path.join(root, 'pages/result/result.wxss'), 'utf8');

  assert.match(wxml, /分账结果/);
  assert.match(wxml, /class="finish-button"[^>]*bindtap="finish"[^>]*aria-label="完成并开始一笔新账单"/);
  assert.match(wxml, /wx:if="{{isReady}}"/);
  assert.match(wxml, /wx:else[^>]*class="error-state"/);
  assert.match(wxml, /已经结清[\s\S]*所有人都无需再转账/);
  assert.match(wxml, /最终净收/);
  assert.doesNotMatch(wxml, /预计收款|总收款|应收合计/);
  assert.match(wxml, /scroll-x="true"/);
  assert.match(wxml, /aria-pressed="{{item\.isSelected}}"/);
  assert.match(wxml, /wx:key="key"/);
  assert.match(wxml, /{{item\.fromName}} 转给 {{item\.toName}}/);
  assert.match(wxml, /请按下面转账/);
  assert.match(wxml, /复制群聊结算文案/);
  assert.match(wxml, /返回修改/);
  assert.match(wxml, /aria-label="复制群聊结算文案"/);
  assert.match(wxml, /aria-label="返回修改账单"/);
  assert.match(wxml, /class="page-error"[^>]*aria-role="alert"/);
  assert.match(wxss, /font-variant-numeric:\s*tabular-nums/);
  assert.match(wxss, /env\(safe-area-inset-bottom\)/);
  assert.doesNotMatch(wxss, /\binset\s*:/);
});
