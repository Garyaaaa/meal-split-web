function validateCount(count) {
  if (!Number.isInteger(count) || count < 2 || count > 20) {
    throw new Error('参与人数必须为 2–20 人');
  }
}

function createLetterParticipants(count) {
  validateCount(count);

  return Array.from({ length: count }, (_, index) => ({
    id: `p${index + 1}`,
    displayName: String.fromCharCode(65 + index),
  }));
}

function createNamedParticipants(names) {
  validateCount(names.length);

  const normalizedNames = names.map((name) => String(name).trim());
  if (normalizedNames.some((name) => name === '')) {
    throw new Error('姓名不能为空');
  }
  if (new Set(normalizedNames).size !== normalizedNames.length) {
    throw new Error('姓名不能重复');
  }

  return normalizedNames.map((displayName, index) => ({
    id: `p${index + 1}`,
    displayName,
  }));
}

function createBill(mode, input) {
  let participants;
  if (mode === 'letters') {
    participants = createLetterParticipants(input);
  } else if (mode === 'names') {
    participants = createNamedParticipants(input);
  } else {
    throw new Error('参与人模式无效');
  }

  return {
    id: 'local-draft',
    participantMode: mode,
    participants,
    expenses: [],
    collectorId: null,
    updatedAt: Date.now(),
  };
}

function reconcileParticipants(bill, names) {
  const namedParticipants = createNamedParticipants(names);
  const oldParticipants = bill.participants;
  const usedIds = new Set(oldParticipants.map((participant) => participant.id));
  let nextIdNumber = 1;
  const participants = namedParticipants.map((participant, index) => {
    if (oldParticipants[index]) {
      return { ...participant, id: oldParticipants[index].id };
    }

    while (usedIds.has(`p${nextIdNumber}`)) {
      nextIdNumber += 1;
    }
    const id = `p${nextIdNumber}`;
    usedIds.add(id);
    return { ...participant, id };
  });
  const remainingIds = new Set(participants.map((participant) => participant.id));
  const removedParticipants = oldParticipants.filter(
    (participant) => !remainingIds.has(participant.id),
  );

  for (const removedParticipant of removedParticipants) {
    if (bill.expenses.some((expense) => expense.payerId === removedParticipant.id)) {
      throw new Error(`请先修改 ${removedParticipant.displayName} 付款的消费`);
    }
  }

  const expenses = bill.expenses.map((expense) => {
    if (expense.splitMode !== 'selected') {
      return expense;
    }

    const participantIds = expense.participantIds.filter((id) => remainingIds.has(id));
    if (participantIds.length === 0) {
      throw new Error('修改成员后有消费无人承担');
    }

    return { ...expense, participantIds };
  });

  const collectorId = removedParticipants.some(
    (participant) => participant.id === bill.collectorId,
  )
    ? null
    : bill.collectorId;

  return { ...bill, participants, expenses, collectorId };
}

const participantsApi = {
  createBill,
  createLetterParticipants,
  createNamedParticipants,
  reconcileParticipants,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = participantsApi;
} else if (typeof globalThis !== 'undefined') {
  globalThis.MealSplitParticipants = participantsApi;
}
