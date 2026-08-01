const { assertBill } = require('./settlement');

const STORAGE_KEY = 'meal_split_draft';
const VERSION = 1;
const PERSISTENCE_FIELDS = ['id', 'participantMode', 'collectorId', 'updatedAt'];

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function assertDraftBill(bill) {
  assertBill(bill);

  const hasPersistenceMetadata = PERSISTENCE_FIELDS.some((field) => hasOwn(bill, field));
  if (!hasPersistenceMetadata && bill.expenses.length === 0) {
    return;
  }

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

module.exports = { STORAGE_KEY, createDraftStore };
