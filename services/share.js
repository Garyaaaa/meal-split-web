function getFormatCents() {
  if (typeof module !== 'undefined' && module.exports) {
    return require('../utils/money').formatCents;
  }
  if (typeof globalThis !== 'undefined' && globalThis.MealSplitMoney) {
    return globalThis.MealSplitMoney.formatCents;
  }
  throw new Error('金额格式化服务不可用');
}

function buildShareText(result, language = 'zh') {
  const formatCents = getFormatCents();
  const isEnglish = language === 'en';
  const header = isEnglish
    ? `Meal Split — Total $${formatCents(result.totalCents)}`
    : `【吃饭分账】总消费 ¥${formatCents(result.totalCents)}`;
  if (!result.collectorId) {
    return `${header}\n${isEnglish ? 'Everyone is settled. No transfers needed.' : '大家已经结清，无需转账'}`;
  }

  const names = new Map(result.members.map((member) => [member.id, member.displayName]));
  const collectorLine = isEnglish
    ? `Main collector: ${names.get(result.collectorId)} receives $${formatCents(result.collectorAmountCents)}`
    : `主收款人 ${names.get(result.collectorId)} 应收 ¥${formatCents(result.collectorAmountCents)}`;
  const transferLines = result.transfers.map((transfer) => (
    isEnglish
      ? `${names.get(transfer.fromId)} → ${names.get(transfer.toId)}: $${formatCents(transfer.amountCents)}`
      : `${names.get(transfer.fromId)} → ${names.get(transfer.toId)}：¥${formatCents(transfer.amountCents)}`
  ));

  return `${header}\n${collectorLine}\n\n${transferLines.join('\n')}`;
}

const shareApi = { buildShareText };

if (typeof module !== 'undefined' && module.exports) {
  module.exports = shareApi;
} else if (typeof globalThis !== 'undefined') {
  globalThis.MealSplitShare = shareApi;
}
