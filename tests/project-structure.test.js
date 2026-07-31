const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');

test('declares the mini-program pages in the required order', () => {
  const appConfig = JSON.parse(
    fs.readFileSync(path.join(projectRoot, 'app.json'), 'utf8'),
  );

  assert.deepEqual(appConfig.pages, [
    'pages/start/start',
    'pages/ledger/ledger',
    'pages/result/result',
  ]);
});

test('registers the expense editor on the ledger page', () => {
  const ledgerConfig = JSON.parse(
    fs.readFileSync(path.join(projectRoot, 'pages/ledger/ledger.json'), 'utf8'),
  );

  assert.equal(
    ledgerConfig.usingComponents['expense-editor'],
    '/components/expense-editor/expense-editor',
  );
});
