/**
 * Whole dollars to top up so that `balance` covers `needed` (the top-up form takes whole dollars).
 * The shortfall is worked out in cents first: in floating point 75.40 - 25.40 is
 * 50.00000000000001, and Math.ceil of that suggested $51 when $50 was enough.
 */
export const topupToCover = (needed, balance) => {
  const shortfallCents = Math.round(parseFloat(needed) * 100) - Math.round(parseFloat(balance) * 100);
  return Math.max(1, Math.ceil(shortfallCents / 100));
};
