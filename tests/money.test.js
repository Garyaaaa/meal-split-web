const test = require('node:test');
const assert = require('node:assert/strict');

const { parseYuanToCents, formatCents } = require('../utils/money');

test('parses valid yuan amounts into cents', () => {
  assert.equal(parseYuanToCents('390'), 39000);
  assert.equal(parseYuanToCents('60.5'), 6050);
  assert.equal(parseYuanToCents('0.01'), 1);
});

test('rejects invalid or non-positive yuan amounts', () => {
  for (const input of ['', '0', '-1', '1.234', 'abc']) {
    assert.equal(parseYuanToCents(input), null);
  }
});

test('formats cents as yuan with two decimal places', () => {
  assert.equal(formatCents(1), '0.01');
  assert.equal(formatCents(9160), '91.60');
});
