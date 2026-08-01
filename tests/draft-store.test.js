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

function createStorage(initialValue) {
  const values = new Map();
  if (initialValue !== undefined) {
    values.set(STORAGE_KEY, initialValue);
  }

  return {
    getStorageSync(key) {
      return values.get(key);
    },
    setStorageSync(key, value) {
      values.set(key, value);
    },
    removeStorageSync(key) {
      values.delete(key);
    },
  };
}

test('saves and loads a valid empty draft in a versioned envelope', () => {
  const bill = createBill();
  const storage = createStorage();
  const store = createDraftStore(storage);

  store.save(bill);

  assert.deepEqual(storage.getStorageSync(STORAGE_KEY), { version: 1, bill });
  assert.equal(store.load(), bill);
});

test('clears the stored draft', () => {
  const storage = createStorage({ version: 1, bill: createBill() });
  const store = createDraftStore(storage);

  store.clear();

  assert.equal(storage.getStorageSync(STORAGE_KEY), undefined);
});

test('ignores drafts from an incompatible version', () => {
  const storage = createStorage({ version: 2, bill: createBill() });

  assert.equal(createDraftStore(storage).load(), null);
});

test('ignores drafts with invalid participants', () => {
  const storage = createStorage({
    version: 1,
    bill: {
      participants: [{ id: 'p1', displayName: 'A' }],
      expenses: [],
    },
  });

  assert.equal(createDraftStore(storage).load(), null);
});

test('rejects invalid bills on save with a controlled error', () => {
  const store = createDraftStore(createStorage());

  assert.throws(
    () => store.save({ participants: [], expenses: [] }),
    { name: 'Error', message: '账单草稿无效' },
  );
});

test('returns null when stored data is corrupt', () => {
  const storage = createStorage({ version: 1 });

  assert.equal(createDraftStore(storage).load(), null);
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
