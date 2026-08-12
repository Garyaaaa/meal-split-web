function getFormatCents() {
  if (typeof module !== 'undefined' && module.exports) {
    return require('../utils/money').formatCents;
  }
  if (typeof globalThis !== 'undefined' && globalThis.MealSplitMoney) {
    return globalThis.MealSplitMoney.formatCents;
  }
  throw new Error('金额格式化服务不可用');
}

function buildShareText(result) {
  const formatCents = getFormatCents();
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

const shareApi = { buildShareText };

if (typeof module !== 'undefined' && module.exports) {
  module.exports = shareApi;
} else if (typeof globalThis !== 'undefined') {
  globalThis.MealSplitShare = shareApi;
}
