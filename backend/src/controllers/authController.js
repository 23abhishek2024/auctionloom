const authService = require('../services/authService');
const { requireEmail, requireNewPassword, requireString, optionalString } = require('../utils/validators');

/**
 * POST /api/auth/register
 * Email must look like an email, the password must be 8 to 72 characters, the name at most 100.
 */
const register = async (req, res, next) => {
  try {
    const { email, password, role, name } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const cleanEmail = requireEmail(email);
    requireNewPassword(password);
    const cleanName = optionalString(name, 'Name', 100);

    const { user, token } = await authService.register({ email: cleanEmail, password, role, name: cleanName });
    res.status(201).json({ user, token });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/auth/login
 */
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Both must be non-empty text (a number or an object here used to crash with a 500)
    if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const { user, token } = await authService.login(email, password);
    res.json({ user, token });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/auth/me
 */
const getMe = async (req, res, next) => {
  try {
    const user = await authService.getProfile(req.user.id);
    res.json({ user });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/auth/profile - Update user's name (1 to 100 characters)
 */
const updateProfile = async (req, res, next) => {
  try {
    const name = requireString(req.body.name, 'Name', 100);
    const { user, token } = await authService.updateName(req.user.id, name);
    res.json({ user, token });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/auth/password - Change password: { currentPassword, newPassword }
 * Logs out every other session and returns a fresh token for this one.
 */
const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (typeof currentPassword !== 'string' || !currentPassword) {
      return res.status(400).json({ error: 'Current password is required.' });
    }
    requireNewPassword(newPassword, 'New password');

    const { user, token } = await authService.changePassword(req.user.id, currentPassword, newPassword);
    res.json({ message: 'Password changed. Other sessions have been logged out.', user, token });
  } catch (err) {
    next(err);
  }
};

module.exports = { register, login, getMe, updateProfile, changePassword };
