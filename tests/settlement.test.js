const test = require('node:test');
const assert = require('node:assert/strict');

const { assertBill, calculateSettlement } = require('../services/settlement');

function createParticipants(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `p${index + 1}`,
    displayName: String.fromCharCode(65 + index),
  }));
}

test('routes case one debts to the highest-paying collector', () => {
  const result = calculateSettlement({
    participants: createParticipants(5),
    expenses: [
      { amountCents: 39800, payerId: 'p1', splitMode: 'all' },
      { amountCents: 6000, payerId: 'p2', splitMode: 'all' },
      {
        amountCents: 1000,
        payerId: 'p2',
        splitMode: 'selected',
        participantIds: ['p3'],
      },
    ],
  });

  assert.equal(result.totalCents, 46800);
  assert.equal(result.collectorId, 'p1');
  assert.deepEqual(result.transfers, [
    { fromId: 'p2', toId: 'p1', amountCents: 2160 },
    { fromId: 'p3', toId: 'p1', amountCents: 10160 },
    { fromId: 'p4', toId: 'p1', amountCents: 9160 },
    { fromId: 'p5', toId: 'p1', amountCents: 9160 },
  ]);
});

test('assigns remainder cents in participant order', () => {
  const result = calculateSettlement({
    participants: createParticipants(5),
    expenses: [
      { amountCents: 39000, payerId: 'p1', splitMode: 'all' },
      { amountCents: 6000, payerId: 'p2', splitMode: 'all' },
      {
        amountCents: 5000,
        payerId: 'p3',
        splitMode: 'selected',
        participantIds: ['p1', 'p2', 'p3'],
      },
    ],
  });

  assert.deepEqual(
    result.members.map((member) => member.owedCents),
    [10667, 10667, 10666, 9000, 9000],
  );
  assert.deepEqual(result.transfers, [
    { fromId: 'p2', toId: 'p1', amountCents: 4667 },
    { fromId: 'p3', toId: 'p1', amountCents: 5666 },
    { fromId: 'p4', toId: 'p1', amountCents: 9000 },
    { fromId: 'p5', toId: 'p1', amountCents: 9000 },
  ]);
});

test('routes a collector payment to another creditor', () => {
  const result = calculateSettlement({
    participants: createParticipants(3),
    expenses: [
      { amountCents: 9000, payerId: 'p1', splitMode: 'all' },
      { amountCents: 6000, payerId: 'p2', splitMode: 'all' },
    ],
  });

  assert.equal(result.collectorId, 'p1');
  assert.deepEqual(result.transfers, [
    { fromId: 'p1', toId: 'p2', amountCents: 1000 },
    { fromId: 'p3', toId: 'p1', amountCents: 5000 },
  ]);
});

test('preserves exact owed and net cent invariants', () => {
  const result = calculateSettlement({
    participants: createParticipants(3),
    expenses: [{ amountCents: 5000, payerId: 'p3', splitMode: 'all' }],
  });

  assert.equal(
    result.members.reduce((sum, member) => sum + member.owedCents, 0),
    result.totalCents,
  );
  assert.equal(
    result.members.reduce((sum, member) => sum + member.netCents, 0),
    0,
  );
});

test('rejects a cumulative bill total above the safe integer limit', () => {
  assert.throws(
    () => calculateSettlement({
      participants: createParticipants(2),
      expenses: [
        {
          amountCents: Number.MAX_SAFE_INTEGER,
          payerId: 'p1',
          splitMode: 'all',
        },
        { amountCents: 2, payerId: 'p2', splitMode: 'all' },
      ],
    }),
    { name: 'Error', message: '账单总额过大' },
  );
});

test('rejects missing and malformed participant entries with a controlled error', () => {
  const sparseParticipants = createParticipants(2);
  delete sparseParticipants[1];

  for (const participants of [
    sparseParticipants,
    [createParticipants(2)[0], null],
    [createParticipants(2)[0], 'B'],
  ]) {
    assert.throws(
      () => assertBill({ participants, expenses: [] }),
      { name: 'Error', message: '参与人姓名为空' },
    );
  }
});

test('rejects a hole in selected participant IDs', () => {
  assert.throws(
    () => assertBill({
      participants: createParticipants(2),
      expenses: [{
        amountCents: 100,
        payerId: 'p1',
        splitMode: 'selected',
        participantIds: Array(1),
      }],
    }),
    { name: 'Error', message: '承担人无效' },
  );
});

test('rejects missing and null expense entries as invalid records', () => {
  for (const expenses of [Array(1), [null]]) {
    assert.throws(
      () => assertBill({ participants: createParticipants(2), expenses }),
      { name: 'Error', message: '消费记录无效' },
    );
  }
});
