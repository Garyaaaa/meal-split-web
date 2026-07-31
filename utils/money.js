function parseYuanToCents(input) {
  const normalized = String(input).trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) {
    return null;
  }

  const [yuan, decimalPart = ''] = normalized.split('.');
  const cents = Number(yuan) * 100 + Number(decimalPart.padEnd(2, '0'));
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}

function formatCents(cents) {
  if (!Number.isSafeInteger(cents)) {
    throw new TypeError('cents must be an integer');
  }

  return (cents / 100).toFixed(2);
}

module.exports = { parseYuanToCents, formatCents };
