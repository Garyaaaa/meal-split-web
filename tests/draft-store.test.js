const test = require('node:test');
const assert = require('node:assert/strict');

const { STORAGE_KEY, createDraftStore } = require('../services/draft-store');

function createBill() {
  return {
    participants: [
      { id: 'p1', displayName: 'A' },
      { id: 'p2', displayName: 'B' },
    ],
    expenses: [],
  };
}

function createAppBill(overrides = {}) {
  return {
    id: 'local-draft',
    participantMode: 'letters',
    participants: createBill().participants,
    expenses: [
      {
        id: 'e1',
        amountCents: 1200,
        payerId: 'p1',
        splitMode: 'all',
        note: '',
      },
    ],
    collectorId: null,
    updatedAt: 0,
    ...overrides,
  };
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function createMemoryStorage(initialValue) {
  const values = new Map();
  if (initialValue !== undefined) {
    values.set(STORAGE_KEY, clone(initialValue));
  }

  return {
    getStorageSync(key) {
      return clone(values.get(key));
    },
    setStorageSync(key, value) {
      values.set(key, clone(value));
    },
    removeStorageSync(key) {
      values.delete(key);
    },
  };
}

test('saves and loads a valid empty draft in a versioned envelope', () => {
  const bill = createBill();
  const storage = createMemoryStorage();
  const store = createDraftStore(storage);

  store.save(bill);

  assert.deepEqual(storage.getStorageSync(STORAGE_KEY), { version: 1, bill });
  assert.deepEqual(store.load(), bill);
});

test('clears the stored draft', () => {
  const storage = createMemoryStorage({ version: 1, bill: createBill() });
  const store = createDraftStore(storage);

  store.clear();

  assert.equal(storage.getStorageSync(STORAGE_KEY), undefined);
});

test('ignores drafts from an incompatible version', () => {
  const storage = createMemoryStorage({ version: 2, bill: createBill() });

  assert.equal(createDraftStore(storage).load(), null);
});

test('ignores drafts with invalid participants', () => {
  const storage = createMemoryStorage({
    version: 1,
    bill: {
      participants: [{ id: 'p1', displayName: 'A' }],
      expenses: [],
    },
  });

  assert.equal(createDraftStore(storage).load(), null);
});

test('rejects invalid bills on save with a controlled error', () => {
  const store = createDraftStore(createMemoryStorage());

  assert.throws(
    () => store.save({ participants: [], expenses: [] }),
    { name: 'Error', message: '账单草稿无效' },
  );
});

test('returns null when stored data is corrupt', () => {
  const storage = createMemoryStorage({ version: 1 });

  assert.equal(createDraftStore(storage).load(), null);
});

test('loads a complete app-shaped draft', () => {
  const bill = createAppBill();
  const storage = createMemoryStorage({ version: 1, bill });

  assert.deepEqual(createDraftStore(storage).load(), bill);
});

test('rejects a persisted draft with a bogus participant mode', () => {
  const bill = createAppBill({ participantMode: 'custom' });
  const storage = createMemoryStorage({ version: 1, bill });

  assert.equal(createDraftStore(storage).load(), null);
});

test('rejects partial persistence metadata even when expenses are empty', () => {
  const bill = { ...createBill(), id: 'local-draft' };
  const storage = createMemoryStorage({ version: 1, bill });

  assert.equal(createDraftStore(storage).load(), null);
});

test('rejects missing persistence metadata when expenses are nonempty', () => {
  const bill = createAppBill();
  delete bill.updatedAt;
  const storage = createMemoryStorage({ version: 1, bill });

  assert.equal(createDraftStore(storage).load(), null);
});

test('rejects a persisted draft with an unknown collector', () => {
  const bill = createAppBill({ collectorId: 'missing' });
  const storage = createMemoryStorage({ version: 1, bill });

  assert.equal(createDraftStore(storage).load(), null);
});

test('rejects persisted drafts with invalid timestamps', () => {
  for (const updatedAt of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    const bill = createAppBill({ updatedAt });
    const storage = createMemoryStorage({ version: 1, bill });

    assert.equal(createDraftStore(storage).load(), null);
  }
});

test('rejects persisted expenses with missing or blank IDs', () => {
  for (const id of [undefined, '', '   ']) {
    const expense = { ...createAppBill().expenses[0], id };
    const bill = createAppBill({ expenses: [expense] });
    const storage = createMemoryStorage({ version: 1, bill });

    assert.equal(createDraftStore(storage).load(), null);
  }
});

test('rejects duplicate persisted expense IDs', () => {
  const expense = createAppBill().expenses[0];
  const bill = createAppBill({
    expenses: [expense, { ...expense, amountCents: 800 }],
  });
  const storage = createMemoryStorage({ version: 1, bill });

  assert.equal(createDraftStore(storage).load(), null);
});

test('rejects a persisted expense with an invalid split mode', () => {
  const expense = { ...createAppBill().expenses[0], splitMode: 'everyone' };
  const bill = createAppBill({ expenses: [expense] });
  const storage = createMemoryStorage({ version: 1, bill });

  assert.equal(createDraftStore(storage).load(), null);
});

test('rejects a persisted expense with a non-string note', () => {
  const expense = { ...createAppBill().expenses[0], note: 42 };
  const bill = createAppBill({ expenses: [expense] });
  const storage = createMemoryStorage({ version: 1, bill });

  assert.equal(createDraftStore(storage).load(), null);
});

test('rejects invalid persistence metadata on save with a controlled error', () => {
  const store = createDraftStore(createMemoryStorage());

  assert.throws(
    () => store.save(createAppBill({ participantMode: 'custom' })),
    { name: 'Error', message: '账单草稿无效' },
  );
});

test('persists a snapshot isolated from later bill mutations', () => {
  const bill = createAppBill();
  const store = createDraftStore(createMemoryStorage());

  store.save(bill);
  bill.participants[0].displayName = 'Changed';

  assert.equal(store.load().participants[0].displayName, 'A');
});

test('returns loaded data isolated from the persisted snapshot', () => {
  const store = createDraftStore(createMemoryStorage({
    version: 1,
    bill: createAppBill(),
  }));

  const loaded = store.load();
  loaded.participants[0].displayName = 'Changed';

  assert.equal(store.load().participants[0].displayName, 'A');
});

test('propagates storage write errors from save', () => {
  const storageError = new Error('storage full');
  const storage = {
    getStorageSync() {},
    setStorageSync() {
      throw storageError;
    },
    removeStorageSync() {},
  };

  assert.throws(() => createDraftStore(storage).save(createBill()), storageError);
});

test('propagates storage removal errors from clear', () => {
  const storageError = new Error('storage unavailable');
  const storage = {
    getStorageSync() {},
    setStorageSync() {},
    removeStorageSync() {
      throw storageError;
    },
  };

  assert.throws(() => createDraftStore(storage).clear(), storageError);
});

test('returns null when reading storage fails', () => {
  const storage = {
    getStorageSync() {
      throw new Error('storage unavailable');
    },
    setStorageSync() {},
    removeStorageSync() {},
  };

  assert.equal(createDraftStore(storage).load(), null);
});
