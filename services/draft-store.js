const { assertBill } = require('./settlement');

const STORAGE_KEY = 'meal_split_draft';
const VERSION = 1;

function createDraftStore(storage) {
  return {
    save(bill) {
      try {
        assertBill(bill);
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

        assertBill(envelope.bill);
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
