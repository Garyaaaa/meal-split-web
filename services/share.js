const { formatCents } = require('../utils/money');

function buildShareText(result) {
  const header = `【吃饭分账】总消费 ¥${formatCents(result.totalCents)}`;
  if (!result.collectorId) {
    return `${header}\n大家已经结清，无需转账`;
  }

  const names = new Map(result.members.map((member) => [member.id, member.displayName]));
  const collectorLine = `主收款人 ${names.get(result.collectorId)} 应收 ¥${formatCents(result.collectorAmountCents)}`;
  const transferLines = result.transfers.map((transfer) => (
    `${names.get(transfer.fromId)} → ${names.get(transfer.toId)}：¥${formatCents(transfer.amountCents)}`
  ));

  return `${header}\n${collectorLine}\n\n${transferLines.join('\n')}`;
}

module.exports = { buildShareText };
