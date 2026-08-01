const test = require('node:test');
const assert = require('node:assert/strict');

let componentDefinition;
global.Component = (definition) => {
  componentDefinition = definition;
};
require('../components/expense-editor/expense-editor');

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

const participants = [
  { id: 'p1', displayName: 'A' },
  { id: 'p2', displayName: 'B' },
  { id: 'p3', displayName: 'C' },
];

function createComponent(properties = {}) {
  const emitted = [];
  const initialData = Object.assign(clone(componentDefinition.data), {
    visible: false,
    participants: clone(participants),
    value: null,
  });
  Object.assign(initialData, properties);
  const instance = {
    data: initialData,
    setData(patch) {
      Object.assign(this.data, patch);
    },
    triggerEvent(name, detail) {
      emitted.push({ name, detail: clone(detail) });
    },
  };
  Object.assign(instance, componentDefinition.methods);
  instance.data.visible = true;
  componentDefinition.properties.visible.observer.call(instance, true);
  return { instance, emitted };
}

test('opening a new expense resets stale fields and selects every participant', () => {
  const { instance } = createComponent();
  instance.setData({
    amountInput: '99.00',
    note: 'old',
    payerId: 'p3',
    splitMode: 'selected',
    selectedParticipantIds: ['p3'],
    error: 'old error',
  });
  componentDefinition.properties.visible.observer.call(instance, true);

  assert.equal(instance.data.amountInput, '');
  assert.equal(instance.data.note, '');
  assert.equal(instance.data.payerId, 'p1');
  assert.equal(instance.data.splitMode, 'all');
  assert.deepEqual(instance.data.selectedParticipantIds, ['p1', 'p2', 'p3']);
  assert.equal(instance.data.error, '');
});

test('opening an edited selected expense restores exact values without mutating properties', () => {
  const value = {
    id: 'e1',
    amountInput: '12.30',
    amountCents: 1230,
    payerId: 'p2',
    splitMode: 'selected',
    participantIds: ['p3', 'p1'],
    note: '  晚餐  ',
  };
  const originalValue = clone(value);
  const originalParticipants = clone(participants);

  const { instance } = createComponent({ value, participants });
  instance.toggleParticipant({ currentTarget: { dataset: { id: 'p2' } } });

  assert.equal(instance.data.amountInput, '12.30');
  assert.equal(instance.data.note, '  晚餐  ');
  assert.equal(instance.data.payerId, 'p2');
  assert.equal(instance.data.splitMode, 'selected');
  assert.deepEqual(instance.data.selectedParticipantIds, ['p1', 'p2', 'p3']);
  assert.deepEqual(value, originalValue);
  assert.deepEqual(participants, originalParticipants);
});

test('an edited all-expense prepares all participants for a convenient selected split', () => {
  const { instance } = createComponent({
    value: {
      id: 'e1',
      amountInput: '8.00',
      amountCents: 800,
      payerId: 'p1',
      splitMode: 'all',
      participantIds: [],
      note: '',
    },
  });

  instance.chooseSplitMode({ currentTarget: { dataset: { mode: 'selected' } } });

  assert.deepEqual(instance.data.selectedParticipantIds, ['p1', 'p2', 'p3']);
});

test('actions ignore unknown people and keep selected IDs in participant order', () => {
  const { instance } = createComponent();

  instance.choosePayer({ currentTarget: { dataset: { id: 'missing' } } });
  assert.equal(instance.data.payerId, 'p1');

  instance.chooseSplitMode({ currentTarget: { dataset: { mode: 'selected' } } });
  instance.toggleParticipant({ currentTarget: { dataset: { id: 'p2' } } });
  instance.toggleParticipant({ currentTarget: { dataset: { id: 'missing' } } });
  instance.toggleParticipant({ currentTarget: { dataset: { id: 'p2' } } });

  assert.deepEqual(instance.data.selectedParticipantIds, ['p1', 'p2', 'p3']);
});

test('invalid amount, payer, mode, and empty selected split show controlled errors without saving', () => {
  const { instance, emitted } = createComponent();

  instance.onAmountInput({ detail: { value: '12.345' } });
  instance.submit();
  assert.equal(instance.data.error, '请输入有效金额（最多两位小数）');

  instance.onAmountInput({ detail: { value: '12.30' } });
  instance.setData({ payerId: 'missing' });
  instance.submit();
  assert.equal(instance.data.error, '请选择付款人');

  instance.setData({ payerId: 'p1', splitMode: 'bogus' });
  instance.submit();
  assert.equal(instance.data.error, '请选择承担方式');

  instance.setData({ splitMode: 'selected', selectedParticipantIds: [] });
  instance.submit();
  assert.equal(instance.data.error, '至少选择一位承担人');
  assert.deepEqual(emitted, []);
});

test('submit emits the exact normalized new expense and close emits close', () => {
  const { instance, emitted } = createComponent();
  instance.onAmountInput({ detail: { value: '12.3' } });
  instance.onNoteInput({ detail: { value: '  周五晚餐  ' } });
  instance.choosePayer({ currentTarget: { dataset: { id: 'p2' } } });
  instance.chooseSplitMode({ currentTarget: { dataset: { mode: 'selected' } } });
  instance.toggleParticipant({ currentTarget: { dataset: { id: 'p1' } } });
  instance.submit();
  instance.close();

  assert.equal(emitted[0].name, 'save');
  assert.match(emitted[0].detail.id, /\S/);
  assert.deepEqual(Object.assign({}, emitted[0].detail, { id: '<generated>' }), {
    id: '<generated>',
    amountCents: 1230,
    payerId: 'p2',
    splitMode: 'selected',
    participantIds: ['p2', 'p3'],
    note: '周五晚餐',
  });
  assert.equal(emitted[1].name, 'close');
});

test('edited all-expense preserves its ID and emits an empty participant list', () => {
  const { instance, emitted } = createComponent({
    value: {
      id: 'e-original',
      amountInput: '9.99',
      payerId: 'p3',
      splitMode: 'all',
      participantIds: [],
      note: ' tea ',
    },
  });

  instance.submit();

  assert.deepEqual(emitted, [{
    name: 'save',
    detail: {
      id: 'e-original',
      amountCents: 999,
      payerId: 'p3',
      splitMode: 'all',
      participantIds: [],
      note: 'tea',
    },
  }]);
});
