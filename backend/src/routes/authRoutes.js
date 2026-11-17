const express = require('express');
const router = express.Router();
const { register, login, getMe, updateProfile, changePassword } = require('../controllers/authController');
const { authMiddleware } = require('../middlewares/auth');
const { loginLimiter, registerLimiter } = require('../middlewares/rateLimiter');

router.post('/register', registerLimiter, register);
router.post('/login', loginLimiter, login);
router.get('/me', authMiddleware, getMe);
router.put('/profile', authMiddleware, updateProfile);
// Wrong current passwords count towards the same failed-attempt limit as logins
router.put('/password', authMiddleware, loginLimiter, changePassword);

module.exports = router;
