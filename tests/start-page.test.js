const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const STORAGE_KEY = 'meal_split_draft';
const storage = new Map();
const calls = { navigateTo: [], navigateBack: [] };
let queuedStorageReads = [];
let storageReadCount = 0;
let storageWriteCount = 0;

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function classDeclarations(wxss, className) {
  const blocks = wxss.replace(/\/\*[\s\S]*?\*\//g, '').split('}');
  const declarations = new Map();

  for (const block of blocks) {
    const match = block.match(new RegExp(`^\\s*\\.${className}\\s*\\{([\\s\\S]*)$`));
    if (!match) {
      continue;
    }
    for (const declaration of match[1].split(';')) {
      const separator = declaration.indexOf(':');
      if (separator !== -1) {
        declarations.set(
          declaration.slice(0, separator).trim(),
          declaration.slice(separator + 1).trim(),
        );
      }
    }
  }

  return declarations;
}

function rpxValue(declarations, property) {
  const match = String(declarations.get(property) || '').match(/^(\d+)rpx$/);
  return match ? Number(match[1]) : null;
}

global.wx = {
  getStorageSync(key) {
    storageReadCount += 1;
    if (queuedStorageReads.length > 0) {
      return clone(queuedStorageReads.shift());
    }
    return clone(storage.get(key));
  },
  setStorageSync(key, value) {
    storageWriteCount += 1;
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
  queuedStorageReads = [];
  storageReadCount = 0;
  storageWriteCount = 0;
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
  assert.equal(page.data.editInitialized, true);

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
  assert.equal(page.data.editInitialized, false);
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

test('never recovers an uninitialized edit from a later storage read', () => {
  resetHarness();
  const recoveredDraft = createDraft();
  const recoveredEnvelope = { version: 1, bill: recoveredDraft };
  storage.set(STORAGE_KEY, clone(recoveredEnvelope));
  queuedStorageReads = [undefined, recoveredEnvelope];
  const page = createPage();

  page.onLoad({ edit: '1' });
  page.onShow();
  page.submit();

  assert.equal(storageReadCount, 1);
  assert.equal(storageWriteCount, 0);
  assert.deepEqual(storage.get(STORAGE_KEY), recoveredEnvelope);
  assert.equal(calls.navigateBack.length, 0);
  assert.equal(calls.navigateTo.length, 0);
  assert.equal(page.data.editing, true);
  assert.equal(page.data.editInitialized, false);
  assert.equal(page.data.error, '未找到可编辑的账单');
});

test('participant setup controls provide at least 88rpx touch targets', () => {
  const wxml = fs.readFileSync(
    path.resolve(__dirname, '../pages/start/start.wxml'),
    'utf8',
  );
  const wxss = fs.readFileSync(
    path.resolve(__dirname, '../pages/start/start.wxss'),
    'utf8',
  );

  const controls = [
    ['draft-link', 'continueDraft'],
    ['segment', 'chooseMode'],
    ['stepper-button', 'changeCount'],
    ['delete-button', 'removeName'],
  ];
  for (const [className, handler] of controls) {
    assert.match(
      wxml,
      new RegExp(`<button\\b[^>]*class="[^"]*${className}[^"]*"[^>]*bindtap="${handler}"[^>]*>`),
    );
    const declarations = classDeclarations(wxss, className);
    assert.ok(declarations.size > 0, `missing active rule for .${className}`);
    assert.ok(
      rpxValue(declarations, 'min-height') >= 88,
      `.${className} touch target is shorter than 88rpx`,
    );
  }

  const stepper = classDeclarations(wxss, 'stepper-button');
  assert.ok(rpxValue(stepper, 'width') >= 88);
  assert.ok(rpxValue(stepper, 'height') >= 88);
});

test('participant naming modes expose their selected state', () => {
  const wxml = fs.readFileSync(
    path.resolve(__dirname, '../pages/start/start.wxml'),
    'utf8',
  );

  const tags = [...wxml.matchAll(/<button\b[^>]*class="segment [^"]*"[^>]*>/g)]
    .map((match) => match[0]);
  assert.equal(tags.length, 2);
  for (const mode of ['letters', 'names']) {
    const tag = tags.find((candidate) => candidate.includes(`data-mode="${mode}"`));
    assert.ok(tag, `missing ${mode} naming mode button`);
    assert.match(tag, /bindtap="chooseMode"/);
    assert.match(tag, new RegExp(`aria-pressed="{{mode === '${mode}'}}"`));
  }
});
