const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const ctrl = require('../controllers/authController');
const { protect } = require('../middleware/auth');

const validateRegister = [
  body('username').trim().isLength({ min: 3, max: 30 }).withMessage('Username must be 3-30 chars'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password').isLength({ min: 6 }).withMessage('Password min 6 characters'),
];

const validateLogin = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password').notEmpty().withMessage('Password required'),
];

// Express 5: spread array into individual args to avoid "next is not a function"
router.post('/register', ...validateRegister, ctrl.register);
router.post('/login',    ...validateLogin,    ctrl.login);
router.post('/refresh',  ctrl.refresh);
router.get('/me',        protect, ctrl.me);

module.exports = router;
