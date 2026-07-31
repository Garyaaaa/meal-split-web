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

  const sign = cents < 0 ? '-' : '';
  const absoluteCents = Math.abs(cents);
  const yuan = Math.floor(absoluteCents / 100);
  const decimal = String(absoluteCents % 100).padStart(2, '0');
  return `${sign}${yuan}.${decimal}`;
}

module.exports = { parseYuanToCents, formatCents };
