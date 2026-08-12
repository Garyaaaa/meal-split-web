const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const root = path.join(__dirname, '..');

function loadApp() {
  const context = { console };
  for (const relativePath of [
    'domain/participants.js',
    'utils/money.js',
    'services/settlement.js',
    'services/share.js',
    'web/i18n.js',
    'web/clipboard.js',
    'web/app.js',
  ]) {
    const filename = path.join(root, relativePath);
    vm.runInNewContext(fs.readFileSync(filename, 'utf8'), context, { filename });
  }
  return context;
}

function createDraftStore() {
  let bill = null;
  return {
    load: () => bill,
    save: (nextBill) => { bill = JSON.parse(JSON.stringify(nextBill)); },
    clear: () => { bill = null; },
    current: () => bill,
  };
}

function createLanguageStorage(initialLanguage) {
  let language = initialLanguage;
  return {
    getItem: () => language,
    setItem: (_key, nextLanguage) => { language = nextLanguage; },
  };
}

function createRenderDocument() {
  const mount = { innerHTML: '' };
  return {
    mount,
    getElementById(id) {
      return id === 'app' ? mount : null;
    },
  };
}

function createRenderFixture(language, note) {
  return createNamedRenderFixture(language, ['Alex', 'Jamie'], note);
}

function createNamedRenderFixture(language, names, note) {
  const context = loadApp();
  const document = createRenderDocument();
  const app = context.MealSplitApp.createApp({
    storage: createDraftStore(),
    languageStorage: createLanguageStorage(language),
    browserLanguage: 'en-US',
    document,
  });

  app.createBill('names', names);
  assert.equal(app.addExpense({
    amount: '86',
    note,
    payerId: 'p1',
    splitMode: 'all',
  }), true);
  app.render();

  return { app, mount: document.mount };
}

function createStartFixture(language = 'en') {
  const context = loadApp();
  const document = createRenderDocument();
  const app = context.MealSplitApp.createApp({
    storage: createDraftStore(),
    languageStorage: createLanguageStorage(language),
    browserLanguage: 'en-US',
    document,
  });
  app.render();
  return { app, mount: document.mount };
}

function attributeValue(attributes, name) {
  const match = attributes.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*["']([^"']*)["']`, 'i'));
  return match ? match[1] : null;
}

function classTokens(classValue) {
  return String(classValue || '').trim().split(/\s+/).filter(Boolean);
}

function hasClass(attributes, className) {
  return classTokens(attributeValue(attributes, 'class')).includes(className);
}

function findOpeningTags(markup, tagName = '[a-z][\\w-]*') {
  const openingTagPattern = new RegExp(`<(${tagName})([^>]*)>`, 'gi');
  return [...markup.matchAll(openingTagPattern)].map((match) => ({
    tagName: match[1],
    attributes: match[2],
    markup: match[0],
    offset: match.index,
    end: match.index + match[0].length,
  }));
}

function findElementsWithClass(markup, className) {
  return findOpeningTags(markup).filter((openingTag) => hasClass(openingTag.attributes, className)).map((openingTag) => {
    const isVoidElement = /\/$/.test(openingTag.attributes.trim())
      || ['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']
        .includes(openingTag.tagName.toLowerCase());
    if (isVoidElement) {
      return { ...openingTag, content: '' };
    }

    const closingTag = new RegExp(`</${openingTag.tagName}\\s*>`, 'i')
      .exec(markup.slice(openingTag.end));
    return {
      ...openingTag,
      content: closingTag ? markup.slice(openingTag.end, openingTag.end + closingTag.index) : '',
    };
  });
}

function extractLedgerHeadline(markup) {
  const headlines = findElementsWithClass(markup, 'ledger-headline');
  assert.equal(headlines.length, 1, 'expected one ledger headline');
  return headlines[0].content;
}

function extractExpenseRow(markup) {
  const rows = findElementsWithClass(markup, 'expense-row');
  assert.equal(rows.length, 1, 'expected one expense row');
  return rows[0];
}

function extractExpenseFields(rowMarkup) {
  const fields = {};
  for (const className of ['expense-note', 'expense-payer', 'expense-split', 'expense-amount']) {
    const elements = findElementsWithClass(rowMarkup, className);
    assert.equal(elements.length, 1, `expected one .${className} element`);
    fields[className] = elements[0];
  }
  return fields;
}

test('locks the approved Chinese translations and ledger headline', () => {
  const { app, mount } = createRenderFixture('zh', '晚餐');

  assert.equal(app.t('ledger.title'), '消费明细');
  assert.match(mount.innerHTML, /消费明细/);

  const headline = extractLedgerHeadline(mount.innerHTML);
  const spans = [...headline.matchAll(/<span(?:\s[^>]*)?>([\s\S]*?)<\/span>/g)]
    .map((match) => match[1]);
  assert.deepEqual(spans, ['今天', '消费了多少']);

  const fields = extractExpenseFields(extractExpenseRow(mount.innerHTML).content);
  assert.match(fields['expense-note'].content, /晚餐/);
  assert.match(fields['expense-payer'].content, /Alex 付款/);
  assert.match(fields['expense-split'].content, /全部参与/);
});

test('locks the approved English ledger copy and expense semantics', () => {
  const { app, mount } = createRenderFixture('en', 'Dinner');

  assert.match(mount.innerHTML, /Today’s spending/);

  const headline = extractLedgerHeadline(mount.innerHTML);
  const spans = [...headline.matchAll(/<span(?:\s[^>]*)?>([\s\S]*?)<\/span>/g)]
    .map((match) => match[1]);
  assert.deepEqual(spans, ['Today’s spending']);

  const fields = extractExpenseFields(extractExpenseRow(mount.innerHTML).content);
  assert.match(fields['expense-note'].content, /Dinner/);
  assert.match(fields['expense-payer'].content, /Paid by Alex/);
  assert.match(fields['expense-split'].content, /Everyone/);
  assert.match(fields['expense-amount'].content, /\$86\.00/);
});

test('locks ordered expense hooks, ledger actions, and amount formatting', () => {
  const { mount } = createRenderFixture('en', 'Dinner');
  const row = extractExpenseRow(mount.innerHTML);
  const hooks = ['expense-note', 'expense-payer', 'expense-split', 'expense-amount'];
  const fields = extractExpenseFields(row.content);
  const positions = hooks.map((className) => fields[className].offset);

  assert.deepEqual([...positions].sort((left, right) => left - right), positions);
  assert.equal(new Set(positions).size, hooks.length, 'expected separate expense field elements');

  const totalCards = findElementsWithClass(mount.innerHTML, 'total-card');
  assert.equal(totalCards.length, 1, 'expected one total card');
  const addExpenseButton = findOpeningTags(mount.innerHTML, 'button')
    .find((button) => attributeValue(button.attributes, 'data-action') === 'open-expense');
  assert.ok(addExpenseButton, 'expected an open-expense button');
  assert.ok(hasClass(addExpenseButton.attributes, 'button'));
  assert.ok(hasClass(addExpenseButton.attributes, 'primary'));
});

test('keeps the participant count stepper inside the create-bill form', () => {
  const { app, mount } = createStartFixture();
  assert.match(mount.innerHTML, /data-action="change-count"/);
  assert.match(mount.innerHTML, /data-count-value/);
  assert.match(mount.innerHTML, /name="count"/);
  assert.match(mount.innerHTML, /segmented-control/);

  const output = { textContent: '2' };
  const form = {
    elements: { count: { value: '2' } },
    querySelector(selector) {
      assert.equal(selector, 'output[data-count-value]');
      return output;
    },
  };
  const button = {
    dataset: { action: 'change-count', direction: 'increase' },
    closest(selector) {
      if (selector === '[data-action]') return this;
      if (selector === 'form[data-action="create-bill"]') return form;
      return null;
    },
  };
  const initialMarkup = mount.innerHTML;

  app.handleClick({ target: button });

  assert.equal(form.elements.count.value, '3');
  assert.equal(output.textContent, '3');
  assert.equal(mount.innerHTML, initialMarkup, 'changing count should not rerender the form');
});

test('persists the participant count when rendering the start screen again', () => {
  const { app, mount } = createStartFixture();
  const output = { textContent: '2' };
  const form = {
    elements: { count: { value: '2' } },
    querySelector(selector) {
      assert.equal(selector, 'output[data-count-value]');
      return output;
    },
  };
  const button = {
    dataset: { action: 'change-count', direction: 'increase' },
    closest(selector) {
      if (selector === '[data-action]') return this;
      if (selector === 'form[data-action="create-bill"]') return form;
      return null;
    },
  };

  app.handleClick({ target: button });
  app.setLanguage('zh');

  assert.match(mount.innerHTML, /<output[^>]*data-count-value[^>]*>3<\/output>/);
  assert.match(mount.innerHTML, /<input type="hidden" name="count" value="3">/);
});

test('renders the expense editor with radio-backed choice chips', () => {
  const { app, mount } = createRenderFixture('en', 'Dinner');

  app.handleClick({
    target: {
      dataset: { action: 'open-expense' },
      closest(selector) {
        return selector === '[data-action]' ? this : null;
      },
    },
  });

  assert.match(mount.innerHTML, /data-action="save-expense"/);
  assert.match(mount.innerHTML, /type="radio"[^>]*name="payerId"/);
  assert.match(mount.innerHTML, /type="radio"[^>]*name="splitMode"/);
  assert.match(mount.innerHTML, /type="checkbox"[^>]*name="participantIds"/);
  assert.ok(findElementsWithClass(mount.innerHTML, 'choice-chip').length >= 4);
  assert.equal(findOpeningTags(mount.innerHTML, 'select').length, 0);
  assert.match(mount.innerHTML, /segmented-control/);
});

test('locks the result collector and transfer hierarchy', () => {
  const { app, mount } = createRenderFixture('en', 'Dinner');

  app.navigate('result');

  const collectorHeroes = findElementsWithClass(mount.innerHTML, 'collector-hero');
  assert.equal(collectorHeroes.length, 1, 'expected one collector hero');
  const collectorHero = collectorHeroes[0];
  assert.match(collectorHero.content, /Alex/);
  assert.match(collectorHero.content, /\$43\.00/);
  assert.equal(findElementsWithClass(collectorHero.content, 'collector-avatar').length, 1);

  const transferLists = findElementsWithClass(mount.innerHTML, 'transfer-list');
  assert.equal(transferLists.length, 1, 'expected one transfer list');
  const transferRows = findElementsWithClass(transferLists[0].content, 'transfer-row');
  assert.equal(transferRows.length, 1, 'expected one transfer row in the transfer list');
  assert.match(transferRows[0].content, /Jamie/);
  assert.match(transferRows[0].content, /Alex/);
  assert.match(transferRows[0].content, /\$43\.00/);
});

test('keeps grapheme clusters intact in collector avatars', () => {
  const { app, mount } = createNamedRenderFixture('en', ['👩‍💻', 'Alex'], 'Dinner');

  app.navigate('result');

  const collectorHero = findElementsWithClass(mount.innerHTML, 'collector-hero')[0];
  const avatars = findElementsWithClass(collectorHero.content, 'collector-avatar');
  assert.equal(avatars.length, 1);
  assert.equal(avatars[0].content, '👩‍💻');
});

test('locks the refreshed stylesheet tokens and entry theme color', () => {
  const styles = fs.readFileSync(path.join(root, 'web/styles.css'), 'utf8');
  const entryHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

  assert.match(styles, /--paper:\s*#f5f5f7/);
  assert.match(styles, /--ink:\s*#17191c/);
  assert.match(styles, /--accent:\s*#1476f2/);
  for (const hook of [
    '.total-card',
    '.collector-hero',
    '.expense-note',
    '.expense-payer',
    '.expense-split',
    '.expense-amount',
    '.overlay',
  ]) {
    assert.ok(styles.includes(hook), `expected stylesheet hook ${hook}`);
  }
  const themeColorMeta = findOpeningTags(entryHtml, 'meta')
    .find((meta) => attributeValue(meta.attributes, 'name') === 'theme-color');
  assert.ok(themeColorMeta, 'expected a theme-color meta tag');
  assert.equal(attributeValue(themeColorMeta.attributes, 'content'), '#f5f5f7');
});
