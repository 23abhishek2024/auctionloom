/**
 * Utility functions for API input validation and sanitization
 */

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isUUID = (str) => {
  return typeof str === 'string' && UUID_REGEX.test(str.trim());
};

const isPositiveNumber = (val) => {
  const num = parseFloat(val);
  return !isNaN(num) && isFinite(num) && num > 0;
};

module.exports = {
  isUUID,
  isPositiveNumber,
};
