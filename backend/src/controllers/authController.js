const authService = require('../services/authService');

/**
 * POST /api/auth/register
 */
const register = async (req, res, next) => {
  try {
    const { email, password, role, name } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const { user, token } = await authService.register({ email, password, role, name });
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

    if (!email || !password) {
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
 * PUT /api/auth/profile - Update user's name
 */
const updateProfile = async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Name is required.' });
    }

    const { user, token } = await authService.updateName(req.user.id, name.trim());
    res.json({ user, token });
  } catch (err) {
    next(err);
  }
};

module.exports = { register, login, getMe, updateProfile };
