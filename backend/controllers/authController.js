const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const User = require('../models/User');

const signTokens = (userId) => {
  const access = jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '15m',
  });
  const refresh = jwt.sign({ id: userId }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  });
  return { access, refresh };
};

// POST /api/auth/register
exports.register = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { username, email, password, campusId } = req.body;

    const user = await User.create({
      username,
      email,
      passwordHash: password, // pre-save hook hashes it
      campusId: campusId || '',
    });

    const { access, refresh } = signTokens(user._id);
    res.status(201).json({ user, access, refresh });
  } catch (err) {
    next(err);
  }
};

// POST /api/auth/login
exports.login = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const { access, refresh } = signTokens(user._id);
    res.json({ user, access, refresh });
  } catch (err) {
    next(err);
  }
};

// POST /api/auth/refresh
exports.refresh = (req, res, next) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ message: 'Refresh token required' });

    const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
    const { access, refresh } = signTokens(decoded.id);
    res.json({ access, refresh });
  } catch {
    res.status(401).json({ message: 'Invalid refresh token' });
  }
};

// GET /api/auth/me
exports.me = async (req, res) => {
  res.json({ user: req.user });
};
