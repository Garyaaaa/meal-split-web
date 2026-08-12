const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const root = path.join(__dirname, '..');

function loadApp() {
  const context = { console };
  for (const relativePath of ['domain/participants.js', 'web/i18n.js', 'web/app.js']) {
    const filename = path.join(root, relativePath);
    vm.runInNewContext(fs.readFileSync(filename, 'utf8'), context, { filename });
  }
  return context;
}

function createDraftStore(initialBill = null) {
  let bill = initialBill;
  return {
    load() {
      return bill;
    },
    save(nextBill) {
      bill = nextBill;
    },
    clear() {
      bill = null;
    },
    current() {
      return bill;
    },
  };
}

function createLanguageStorage(initialLanguage = null) {
  let language = initialLanguage;
  return {
    getItem() {
      return language;
    },
    setItem(key, value) {
      assert.equal(key, 'meal_split_language');
      language = value;
    },
    current() {
      return language;
    },
  };
}

test('detects English browsers and persists an explicit Chinese language choice', () => {
  const context = loadApp();
  const languageStorage = createLanguageStorage();
  const app = context.MealSplitApp.createApp({
    storage: createDraftStore(),
    languageStorage,
    browserLanguage: 'en-US',
  });

  assert.equal(app.getState().language, 'en');
  app.setLanguage('zh');
  assert.equal(app.getState().language, 'zh');
  assert.equal(languageStorage.current(), 'zh');
  assert.equal(app.t('start.title'), '吃饭分账');
});

test('restores a persisted language and exposes the matching English translation', () => {
  const context = loadApp();
  const app = context.MealSplitApp.createApp({
    storage: createDraftStore(),
    languageStorage: createLanguageStorage('en'),
    browserLanguage: 'zh-CN',
  });

  assert.equal(app.getState().language, 'en');
  assert.equal(app.t('start.title'), 'Meal Split');
});

test('creates a bill and transitions from start to ledger and result screens', () => {
  const context = loadApp();
  const storage = createDraftStore();
  const app = context.MealSplitApp.createApp({
    storage,
    languageStorage: createLanguageStorage('en'),
    browserLanguage: 'en-US',
  });

  app.createBill('letters', 2);

  assert.equal(app.getState().screen, 'ledger');
  assert.equal(app.getState().bill.participants.length, 2);
  assert.equal(storage.current().participants[0].displayName, 'A');

  app.navigate('result');
  assert.equal(app.getState().screen, 'result');
});
