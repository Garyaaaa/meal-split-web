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

function reconcileParticipants(bill, names) {
  const namedParticipants = createNamedParticipants(names);
  const oldParticipants = bill.participants;
  const participants = namedParticipants.map((participant, index) => ({
    ...participant,
    id: oldParticipants[index] ? oldParticipants[index].id : participant.id,
  }));
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

  return { ...bill, participants, expenses };
}

module.exports = {
  createLetterParticipants,
  createNamedParticipants,
  reconcileParticipants,
};
