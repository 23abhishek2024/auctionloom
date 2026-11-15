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
 */
async function register({ email, password, role, name }) {
  const existing = await userModel.findByEmail(email);
  if (existing) {
    throw new AppError(409, 'Email already registered.');
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const assignedRole = (role === 'auctioneer' || role === 'bidder') ? role : 'bidder';
  const user = await userModel.create(email, passwordHash, assignedRole, name);

  const token = issueToken({ id: user.id, name: user.name, email: user.email, role: user.role });
  return { user, token };
}

/**
 * Check an email and password. Both "no such email" and "wrong password" give the same
 * message, so the login form can't be used to find out which emails have accounts.
 */
async function login(email, password) {
  const cleanEmail = email.trim().toLowerCase();
  const user = await userModel.findByEmail(cleanEmail);
  if (!user) {
    throw new AppError(401, 'Invalid email or password.');
  }

  const isMatch = await bcrypt.compare(password, user.password_hash);
  if (!isMatch) {
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

module.exports = { issueToken, register, login, getProfile, updateName };
