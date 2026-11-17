/**
 * Utility functions for API input validation and sanitization
 */

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Any value PostgreSQL accepts as a UUID (system accounts use ids like 00000000-0000-0000-0000-000000000000)
const UUID_FORMAT_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isUUID = (str) => {
  return typeof str === 'string' && UUID_REGEX.test(str.trim());
};

const isUuidFormat = (str) => {
  return typeof str === 'string' && UUID_FORMAT_REGEX.test(str.trim());
};

const isPositiveNumber = (val) => {
  const num = parseFloat(val);
  return !isNaN(num) && isFinite(num) && num > 0;
};

// ── Money ───────────────────────────────────────────────────────
// Prices and balances are DECIMAL(12,2) in PostgreSQL: whole cents only.
// A bid of 101.004 would be stored as 101.00 and tie with an existing 101.00 bid,
// so amounts with more than 2 decimal places are refused instead of being rounded silently.
const MAX_AMOUNT = 10000000; // $10,000,000 per bid, listing, top-up or withdrawal
const MONEY_REGEX = /^\d+(\.\d{1,2})?$/;

/**
 * A positive amount with at most 2 decimal places and at most MAX_AMOUNT, as a number;
 * null for anything else (text, NaN, Infinity, 0, negatives, 3+ decimals, too large).
 * Accepts a number (500, 500.5) or a numeric string ("500.50").
 */
const parseMoney = (val) => {
  let text;
  if (typeof val === 'number') {
    if (!Number.isFinite(val)) return null;
    text = String(val); // shortest form: 101.5 -> "101.5", 101.004 -> "101.004", 1e21 -> "1e+21"
  } else if (typeof val === 'string') {
    text = val.trim();
  } else {
    return null;
  }
  if (!MONEY_REGEX.test(text)) return null;
  const amount = Number(text);
  if (!(amount > 0) || amount > MAX_AMOUNT) return null;
  return amount;
};

// The same amount in whole cents, for exact comparisons (101.10 -> 10110)
const toCents = (amount) => Math.round(parseFloat(amount) * 100);

const MONEY_RULE = `a positive amount with at most 2 decimal places, up to $${MAX_AMOUNT.toLocaleString('en-US')}`;

module.exports = {
  isUUID,
  isUuidFormat,
  isPositiveNumber,
  parseMoney,
  toCents,
  MAX_AMOUNT,
  MONEY_RULE,
};
