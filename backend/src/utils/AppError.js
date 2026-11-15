/**
 * An expected failure that a service reports to the controller that called it:
 * "auction not found" (404), "you are not the seller" (403), "the lot is already sold" (400), ...
 *
 * Services decide WHAT went wrong; they never touch req or res. The HTTP layer decides how to
 * answer: Express's error handler in app.js sends an AppError as JSON with its status code, and a
 * controller that answers errors itself (walletController) can use sendAppError.
 * Anything else that is thrown is a real bug or outage and becomes a 500.
 */
class AppError extends Error {
  /**
   * @param {number} statusCode HTTP status to answer with (400, 403, 404, 409, ...)
   * @param {string} message    shown to the user as { error: message }
   * @param {object} [details]  extra fields for the JSON body, e.g. { paymentWindowEndsAt }
   */
  constructor(statusCode, message, details = {}) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

// Answer with an AppError: status code plus { error: message, ...details }
const sendAppError = (res, err) => res.status(err.statusCode).json({ error: err.message, ...err.details });

module.exports = { AppError, sendAppError };
