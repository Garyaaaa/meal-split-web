const test = require('node:test');
const assert = require('node:assert/strict');

const { buildShareText } = require('../services/share');

test('builds concise settlement text using member display names', () => {
  const result = {
    totalCents: 46800,
    collectorId: 'p1',
    collectorAmountCents: 30640,
    members: [
      { id: 'p1', displayName: 'A' },
      { id: 'p2', displayName: 'B' },
      { id: 'p3', displayName: 'C' },
    ],
    transfers: [
      { fromId: 'p2', toId: 'p1', amountCents: 2160 },
      { fromId: 'p3', toId: 'p1', amountCents: 10160 },
    ],
  };

  assert.equal(
    buildShareText(result),
    '【吃饭分账】总消费 ¥468.00\n'
      + '主收款人 A 应收 ¥306.40\n\n'
      + 'B → A：¥21.60\n'
      + 'C → A：¥101.60',
  );
});

test('builds settled text when there is no collector or transfer', () => {
  const result = {
    totalCents: 12000,
    collectorId: null,
    collectorAmountCents: 0,
    members: [
      { id: 'p1', displayName: 'A' },
      { id: 'p2', displayName: 'B' },
    ],
    transfers: [],
  };

  assert.equal(
    buildShareText(result),
    '【吃饭分账】总消费 ¥120.00\n大家已经结清，无需转账',
  );
});
