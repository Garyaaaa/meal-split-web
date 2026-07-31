const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createLetterParticipants,
  createNamedParticipants,
  reconcileParticipants,
} = require('../domain/participants');

test('creates letter-named participants', () => {
  assert.deepEqual(
    createLetterParticipants(5).map((participant) => participant.displayName),
    ['A', 'B', 'C', 'D', 'E'],
  );
});

test('rejects blank and duplicate participant names', () => {
  assert.throws(() => createNamedParticipants(['盖老师', '']), /姓名不能为空/);
  assert.throws(() => createNamedParticipants(['小李', '小李']), /姓名不能重复/);
});

test('reconciles names while retaining participant IDs by position', () => {
  const bill = {
    participants: [
      { id: 'p1', displayName: 'A' },
      { id: 'p2', displayName: 'B' },
    ],
    expenses: [],
  };

  const result = reconcileParticipants(bill, ['盖老师', '小李', '老王']);

  assert.deepEqual(result.participants, [
    { id: 'p1', displayName: '盖老师' },
    { id: 'p2', displayName: '小李' },
    { id: 'p3', displayName: '老王' },
  ]);
});

test('blocks removing a participant who paid an expense', () => {
  const bill = {
    participants: [
      { id: 'p1', displayName: 'A' },
      { id: 'p2', displayName: 'B' },
      { id: 'p3', displayName: 'C' },
    ],
    expenses: [
      {
        id: 'e1',
        amountCents: 1000,
        payerId: 'p3',
        splitMode: 'all',
        participantIds: [],
      },
    ],
  };

  assert.throws(() => reconcileParticipants(bill, ['A', 'B']), /先修改 C 付款的消费/);
});
