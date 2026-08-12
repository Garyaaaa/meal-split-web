(function createDraftStoreModule(root) {
function getAssertBill() {
  if (typeof module !== 'undefined' && module.exports) {
    return require('./settlement').assertBill;
  }
  return root.MealSplitSettlement.assertBill;
}

const STORAGE_KEY = 'meal_split_draft';
const VERSION = 1;
const PERSISTENCE_FIELDS = ['id', 'participantMode', 'collectorId', 'updatedAt'];

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function isDenseArray(value) {
  if (!Array.isArray(value)) {
    return false;
  }
  for (let index = 0; index < value.length; index += 1) {
    if (!hasOwn(value, index)) {
      return false;
    }
  }
  return true;
}

function assertDraftBill(bill) {
  getAssertBill()(bill);

  if (
    !PERSISTENCE_FIELDS.every((field) => hasOwn(bill, field))
    || bill.id !== 'local-draft'
    || (bill.participantMode !== 'letters' && bill.participantMode !== 'names')
    || !Number.isSafeInteger(bill.updatedAt)
    || bill.updatedAt < 0
  ) {
    throw new Error('账单草稿无效');
  }

  const participantIds = new Set(bill.participants.map((participant) => participant.id));
  if (bill.collectorId !== null && !participantIds.has(bill.collectorId)) {
    throw new Error('账单草稿无效');
  }

  const expenseIds = new Set();
  for (const expense of bill.expenses) {
    if (
      typeof expense.id !== 'string'
      || expense.id.trim() === ''
      || expenseIds.has(expense.id)
      || (expense.splitMode !== 'all' && expense.splitMode !== 'selected')
      || !isDenseArray(expense.participantIds)
      || (expense.splitMode === 'all' && expense.participantIds.length !== 0)
      || (hasOwn(expense, 'note') && typeof expense.note !== 'string')
    ) {
      throw new Error('账单草稿无效');
    }
    expenseIds.add(expense.id);
  }
}

function createDraftStore(storage) {
  return {
    save(bill) {
      try {
        assertDraftBill(bill);
      } catch (error) {
        throw new Error('账单草稿无效');
      }

      storage.setStorageSync(STORAGE_KEY, { version: VERSION, bill });
    },

    load() {
      try {
        const envelope = storage.getStorageSync(STORAGE_KEY);
        if (!envelope || typeof envelope !== 'object' || envelope.version !== VERSION) {
          return null;
        }

        assertDraftBill(envelope.bill);
        return envelope.bill;
      } catch (error) {
        return null;
      }
    },

    clear() {
      storage.removeStorageSync(STORAGE_KEY);
    },
  };
}

const draftStoreApi = { STORAGE_KEY, createDraftStore };

if (typeof module !== 'undefined' && module.exports) {
  module.exports = draftStoreApi;
} else {
  root.MealSplitDraftStore = draftStoreApi;
}
})(typeof globalThis !== 'undefined' ? globalThis : this);
