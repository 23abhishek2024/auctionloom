/**
 * Utility functions for API input validation and sanitization.
 *
 * Two kinds of helpers:
 * - isUUID, parseMoney, ... return a boolean or the cleaned value (null when invalid), for callers that answer themselves;
 * - requireUuid, optionalString, ... return the cleaned value or throw AppError(400) with a message naming the field,
 *   for controllers that pass errors on with next(err).
 * Checking here means bad input gets a clear 400 instead of reaching PostgreSQL and failing as a 500.
 */
const { AppError } = require('./AppError');

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

// ── Platform fee ────────────────────────────────────────────────
// 5% of the hammer price goes to the platform, the rest to the seller. Worked out in whole cents and
// rounded half up, which is also what the reports' SQL fallback ROUND(price * 0.05, 2) gives.
// (In floating point 20.70 * 0.05 * 100 is 103.49999999999999, so the fee came out a cent short,
//  and closing and settling a lot used two different formulas that disagreed on about 1% of prices.)
const PLATFORM_FEE_PERCENT = 5;
const splitSale = (hammerPrice) => {
  const priceCents = toCents(hammerPrice);
  const feeCents = Math.round((priceCents * PLATFORM_FEE_PERCENT) / 100);
  return { commission: feeCents / 100, sellerPayout: (priceCents - feeCents) / 100 };
};

const MONEY_RULE = `a positive amount with at most 2 decimal places, up to $${MAX_AMOUNT.toLocaleString('en-US')}`;

// ── Throwing helpers (for controllers that use next(err)) ───────
const fail = (message) => {
  throw new AppError(400, message);
};

/** A UUID (route param or body field), or a 400 naming the field */
const requireUuid = (value, field) => {
  if (!isUUID(value)) fail(`Invalid ${field} format. Must be a valid UUID.`);
  return value.trim();
};

/** An amount in whole cents (see parseMoney), or a 400 naming the field */
const requireMoney = (value, field) => {
  const amount = parseMoney(value);
  if (amount === null) fail(`${field} must be ${MONEY_RULE}.`);
  return amount;
};

/** A non-empty string after trimming, at most `max` characters */
const requireString = (value, field, max = 255) => {
  if (typeof value !== 'string' || !value.trim()) fail(`${field} is required.`);
  const text = value.trim();
  if (text.length > max) fail(`${field} must be at most ${max} characters.`);
  return text;
};

/** undefined, null or '' → null; otherwise a string of at most `max` characters (trimmed) */
const optionalString = (value, field, max = 255) => {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') fail(`${field} must be text.`);
  const text = value.trim();
  if (text.length > max) fail(`${field} must be at most ${max} characters.`);
  return text || null;
};

/** A query-string value: absent → null; one string (not repeated, not an object) of at most `max` characters */
const optionalQueryString = (value, field, max = 100) => {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') fail(`Query parameter "${field}" must be given once, as text.`);
  if (value.length > max) fail(`Query parameter "${field}" must be at most ${max} characters.`);
  return value;
};

/** A calendar date "YYYY-MM-DD" for report filters, or null when absent */
const optionalDateParam = (value, field) => {
  const text = optionalQueryString(value, field, 10);
  if (text === null) return null;
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(text) && !isNaN(new Date(`${text}T00:00:00Z`).getTime());
  if (!valid) fail(`Query parameter "${field}" must be a date like 2026-11-30.`);
  return text;
};

const MAX_AUCTION_DAYS = 365;

/** An end time that parses as a date, is in the future and at most a year away; returned as an ISO string */
const requireFutureEndTime = (value, field = 'end_time') => {
  if (typeof value !== 'string' && typeof value !== 'number') fail(`${field} is required.`);
  const date = new Date(value);
  if (isNaN(date.getTime()) || date <= new Date()) fail(`${field} must be in the future.`);
  if (date.getTime() - Date.now() > MAX_AUCTION_DAYS * 24 * 60 * 60 * 1000) {
    fail(`${field} must be within ${MAX_AUCTION_DAYS} days.`);
  }
  return date.toISOString();
};

// ── Accounts ────────────────────────────────────────────────────
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 72; // bcrypt only uses the first 72 bytes

/** A plausible email address (trimmed, lower-cased), or a 400 */
const requireEmail = (value) => {
  if (typeof value !== 'string' || !EMAIL_REGEX.test(value.trim()) || value.trim().length > 254) {
    fail('Please enter a valid email address.');
  }
  return value.trim().toLowerCase();
};

/** A new password of 8 to 72 characters, or a 400 */
const requireNewPassword = (value, field = 'Password') => {
  if (typeof value !== 'string' || value.length < PASSWORD_MIN) {
    fail(`${field} must be at least ${PASSWORD_MIN} characters.`);
  }
  if (Buffer.byteLength(value, 'utf8') > PASSWORD_MAX) fail(`${field} must be at most ${PASSWORD_MAX} characters.`);
  return value;
};

module.exports = {
  isUUID,
  isUuidFormat,
  isPositiveNumber,
  parseMoney,
  toCents,
  PLATFORM_FEE_PERCENT,
  splitSale,
  MAX_AMOUNT,
  MONEY_RULE,
  requireUuid,
  requireMoney,
  requireString,
  optionalString,
  optionalQueryString,
  optionalDateParam,
  requireFutureEndTime,
  requireEmail,
  requireNewPassword,
  EMAIL_REGEX,
};
