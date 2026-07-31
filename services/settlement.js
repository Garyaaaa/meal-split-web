function assertBill(bill) {
  if (
    !bill
    || typeof bill !== 'object'
    || !Array.isArray(bill.participants)
    || bill.participants.length < 2
    || bill.participants.length > 20
  ) {
    throw new Error('参与人数必须为 2–20 人');
  }
  if (!Array.isArray(bill.expenses)) {
    throw new Error('消费记录无效');
  }

  const participantIds = bill.participants.map((participant) => participant && participant.id);
  if (new Set(participantIds).size !== participantIds.length) {
    throw new Error('参与人 ID 重复');
  }

  const displayNames = bill.participants.map((participant) => (
    participant && typeof participant.displayName === 'string'
      ? participant.displayName.trim()
      : ''
  ));
  if (displayNames.some((displayName) => displayName === '')) {
    throw new Error('参与人姓名为空');
  }
  if (new Set(displayNames).size !== displayNames.length) {
    throw new Error('参与人姓名重复');
  }

  const participantIdSet = new Set(participantIds);
  for (const expense of bill.expenses) {
    if (!expense || !Number.isSafeInteger(expense.amountCents) || expense.amountCents <= 0) {
      throw new Error('消费金额无效');
    }
    if (!participantIdSet.has(expense.payerId)) {
      throw new Error('付款人无效');
    }
    if (expense.splitMode !== 'all' && expense.splitMode !== 'selected') {
      throw new Error('承担方式无效');
    }
    if (expense.splitMode === 'selected') {
      if (!Array.isArray(expense.participantIds) || expense.participantIds.length === 0) {
        throw new Error('至少选择一位承担人');
      }
      if (expense.participantIds.some((id) => !participantIdSet.has(id))) {
        throw new Error('承担人无效');
      }
    }
  }
}

function calculateSettlement(bill, requestedCollectorId) {
  assertBill(bill);

  const participantOrder = new Map(
    bill.participants.map((participant, index) => [participant.id, index]),
  );
  const paidCents = new Map(bill.participants.map((participant) => [participant.id, 0]));
  const owedCents = new Map(bill.participants.map((participant) => [participant.id, 0]));
  let totalCents = 0;

  for (const expense of bill.expenses) {
    totalCents += expense.amountCents;
    paidCents.set(expense.payerId, paidCents.get(expense.payerId) + expense.amountCents);

    const selectedIds = bill.participants
      .filter((participant) => (
        expense.splitMode === 'all' || expense.participantIds.includes(participant.id)
      ))
      .map((participant) => participant.id);
    const baseCents = Math.floor(expense.amountCents / selectedIds.length);
    const remainderCents = expense.amountCents % selectedIds.length;

    selectedIds.forEach((participantId, index) => {
      const shareCents = baseCents + (index < remainderCents ? 1 : 0);
      owedCents.set(participantId, owedCents.get(participantId) + shareCents);
    });
  }

  const members = bill.participants.map((participant) => {
    const paid = paidCents.get(participant.id);
    const owed = owedCents.get(participant.id);
    return {
      id: participant.id,
      displayName: participant.displayName,
      paidCents: paid,
      owedCents: owed,
      netCents: paid - owed,
    };
  });
  const positiveMembers = members.filter((member) => member.netCents > 0);
  let collector = positiveMembers.find((member) => member.id === requestedCollectorId);

  if (!collector && positiveMembers.length > 0) {
    collector = [...positiveMembers].sort((left, right) => (
      right.paidCents - left.paidCents
      || participantOrder.get(left.id) - participantOrder.get(right.id)
    ))[0];
  }

  const collectorId = collector ? collector.id : null;
  const transfers = [];
  if (collector) {
    for (const member of members) {
      if (member.id === collectorId || member.netCents === 0) {
        continue;
      }
      if (member.netCents < 0) {
        transfers.push({
          fromId: member.id,
          toId: collectorId,
          amountCents: -member.netCents,
        });
      } else {
        transfers.push({
          fromId: collectorId,
          toId: member.id,
          amountCents: member.netCents,
        });
      }
    }
  }

  return {
    totalCents,
    collectorId,
    collectorAmountCents: collector ? collector.netCents : 0,
    members,
    transfers,
  };
}

module.exports = { assertBill, calculateSettlement };
