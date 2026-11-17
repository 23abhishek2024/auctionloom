const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const userModel = require('../models/userModel');
const { AppError } = require('../utils/AppError');

/**
 * Auth Service
 * Registering, logging in, and issuing login tokens.
 */

const SALT_ROUNDS = 10;

/**
 * Sign a login token (valid 7 days). It proves who the user is; their role is still
 * re-read from the database on every request by the auth middleware.
 */
function issueToken({ id, name, email, role }) {
  return jwt.sign({ id, name, email, role }, process.env.JWT_SECRET, { expiresIn: '7d' });
}

/**
 * Create an account and log it in. Public sign-up can only choose 'auctioneer' or 'bidder':
 * any other role asked for (such as 'admin') becomes 'bidder'.
 * The controller has already checked the email (trimmed, lower-cased) and the password length.
 */
async function register({ email, password, role, name }) {
  const existing = await userModel.findByEmail(email);
  if (existing) {
    throw new AppError(409, 'Email already registered.');
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const assignedRole = (role === 'auctioneer' || role === 'bidder') ? role : 'bidder';
  let user;
  try {
    user = await userModel.create(email, passwordHash, assignedRole, name);
  } catch (err) {
    // Two sign-ups with the same email at the same moment: the UNIQUE constraint stops the second one
    if (err.code === '23505') throw new AppError(409, 'Email already registered.');
    throw err;
  }

  const token = issueToken({ id: user.id, name: user.name, email: user.email, role: user.role });
  return { user, token };
}

// A real bcrypt hash of a throwaway value (cost 10, like real passwords). Comparing against it when the
// email is unknown makes that answer take as long as a wrong password, so timing doesn't reveal accounts.
const TIMING_PLACEHOLDER_HASH = '$2b$10$uMiL7x.inkViH18Gc07h6es0iG.fmWfVfiP240gP3UlgKVo4KNGvm';

/**
 * Check an email and password. "No such email" and "wrong password" give the same message and take
 * about the same time (an unknown email used to skip bcrypt and answer ~70 ms faster).
 * (Sign-up still answers "Email already registered", as most sites do.)
 */
async function login(email, password) {
  const cleanEmail = email.trim().toLowerCase();
  const user = await userModel.findByEmail(cleanEmail);

  const isMatch = await bcrypt.compare(password, user ? user.password_hash : TIMING_PLACEHOLDER_HASH);
  if (!user || !isMatch) {
    throw new AppError(401, 'Invalid email or password.');
  }

  const displayName = user.name || user.email.split('@')[0];
  const token = issueToken({ id: user.id, name: displayName, email: user.email, role: user.role });

  return {
    user: { id: user.id, name: displayName, email: user.email, role: user.role },
    token,
  };
}

/**
 * The logged-in user's profile
 */
async function getProfile(userId) {
  const user = await userModel.findById(userId);
  if (!user) throw new AppError(404, 'User not found.');
  return user;
}

/**
 * Change the user's display name. Returns the user and a new token carrying the new name.
 */
async function updateName(userId, name) {
  const updatedUser = await userModel.updateName(userId, name);
  if (!updatedUser) {
    throw new AppError(404, 'User not found.');
  }

  const token = issueToken({ id: updatedUser.id, name: updatedUser.name, email: updatedUser.email, role: updatedUser.role });
  return { user: updatedUser, token };
}

/**
 * Change the password after checking the current one. Every token issued before the change stops
 * working (see loadTokenUser), so other sessions are logged out; the caller gets a fresh token.
 */
async function changePassword(userId, currentPassword, newPassword) {
  const currentHash = await userModel.findPasswordHashById(userId);
  if (!currentHash) throw new AppError(404, 'User not found.');

  // 400, not 401: the session itself is fine (a 401 would make the browser log the user out)
  const isMatch = await bcrypt.compare(currentPassword, currentHash);
  if (!isMatch) throw new AppError(400, 'Your current password is not correct.');
  if (currentPassword === newPassword) throw new AppError(400, 'The new password must be different from the current one.');

  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  const changedAt = new Date(Math.floor(Date.now() / 1000) * 1000); // whole seconds, like a token's iat
  const user = await userModel.updatePasswordHash(userId, passwordHash, changedAt);
  const token = issueToken({ id: user.id, name: user.name || user.email.split('@')[0], email: user.email, role: user.role });
  return { user, token };
}

module.exports = { issueToken, register, login, getProfile, updateName, changePassword };
