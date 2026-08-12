const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

test('static entry includes viewport, semantic mount, and Web scripts', () => {
  assert.match(html, /<meta name="viewport"/);
  assert.match(html, /<main id="app"/);
  assert.match(html, /web\/styles\.css/);
  assert.match(html, /web\/app\.js/);
  assert.doesNotMatch(html, /wx:|app\.json|project\.config/);
});

test('static entry loads browser modules in dependency order', () => {
  const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(scripts, [
    'utils/money.js',
    'domain/participants.js',
    'services/settlement.js',
    'services/share.js',
    'services/draft-store.js',
    'web/storage.js',
    'web/clipboard.js',
    'web/i18n.js',
    'web/app.js',
  ]);
});

test('stylesheet defines focus-visible treatment and touch-sized controls', () => {
  const css = fs.readFileSync(path.join(root, 'web/styles.css'), 'utf8');
  assert.match(css, /:focus-visible/);
  assert.match(css, /min-height:\s*44px/);
  assert.match(css, /@media/);
});
