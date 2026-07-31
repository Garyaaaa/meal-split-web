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

test('accepts participant counts from 2 through 20 and rejects out-of-range counts', () => {
  assert.equal(createLetterParticipants(2).length, 2);
  assert.equal(createLetterParticipants(20).length, 20);
  assert.throws(() => createLetterParticipants(1), /参与人数必须为 2–20 人/);
  assert.throws(() => createLetterParticipants(21), /参与人数必须为 2–20 人/);
});

test('rejects blank and duplicate participant names', () => {
  assert.throws(() => createNamedParticipants(['盖老师', '']), /姓名不能为空/);
  assert.throws(() => createNamedParticipants(['小李', '小李']), /姓名不能重复/);
  assert.throws(() => createNamedParticipants([' 小李 ', '小李']), /姓名不能重复/);
});

test('allocates an unused ID when adding to non-contiguous participant IDs', () => {
  const result = reconcileParticipants(
    {
      participants: [
        { id: 'p1', displayName: 'A' },
        { id: 'p3', displayName: 'B' },
      ],
      expenses: [],
    },
    ['A', 'B', 'C'],
  );

  assert.deepEqual(result.participants.map((participant) => participant.id), ['p1', 'p3', 'p2']);
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

test('clears a collector that is removed', () => {
  const result = reconcileParticipants(
    {
      collectorId: 'p3',
      participants: [
        { id: 'p1', displayName: 'A' },
        { id: 'p2', displayName: 'B' },
        { id: 'p3', displayName: 'C' },
      ],
      expenses: [],
    },
    ['A', 'B'],
  );

  assert.equal(result.collectorId, null);
});

test('prunes removed participants from selected splits without mutating the source bill', () => {
  const bill = {
    collectorId: 'p1',
    participants: [
      { id: 'p1', displayName: 'A' },
      { id: 'p2', displayName: 'B' },
      { id: 'p3', displayName: 'C' },
    ],
    expenses: [{ id: 'e1', payerId: 'p1', splitMode: 'selected', participantIds: ['p1', 'p3'] }],
  };

  const result = reconcileParticipants(bill, ['A', 'B']);

  assert.deepEqual(result.expenses[0].participantIds, ['p1']);
  assert.deepEqual(bill.participants.map((participant) => participant.id), ['p1', 'p2', 'p3']);
  assert.deepEqual(bill.expenses[0].participantIds, ['p1', 'p3']);
  assert.notEqual(result.participants, bill.participants);
  assert.notEqual(result.expenses, bill.expenses);
  assert.notEqual(result.expenses[0], bill.expenses[0]);
});

test('rejects removing the sole selected split bearer', () => {
  const bill = {
    participants: [
      { id: 'p1', displayName: 'A' },
      { id: 'p2', displayName: 'B' },
      { id: 'p3', displayName: 'C' },
    ],
    expenses: [{ id: 'e1', payerId: 'p1', splitMode: 'selected', participantIds: ['p3'] }],
  };

  assert.throws(() => reconcileParticipants(bill, ['A', 'B']), /修改成员后有消费无人承担/);
});
