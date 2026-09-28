const jwt = require('jsonwebtoken');
const User = require('../models/User');

const normalizeEmail = (value) => (typeof value === 'string' ? value.trim().toLowerCase() : '');
const isValidEmail = (value) => /^\S+@\S+\.\S+$/.test(value);
const cookieOptions = (remember = true) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.COOKIE_SAME_SITE || 'lax',
  path: '/api',
  ...(remember ? { maxAge: Number.parseInt(process.env.JWT_COOKIE_MAX_AGE_MS || '604800000', 10) } : {}),
});

const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });

// POST /api/auth/register
exports.register = async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const normalizedEmail = normalizeEmail(email);
    const normalizedName = typeof name === 'string' ? name.trim() : '';
    if (!normalizedName || !isValidEmail(normalizedEmail) || typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ message: 'Provide a name, valid email, and password of at least 8 characters' });
    }
    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) return res.status(409).json({ message: 'Email already registered' });

    const user = await User.create({ name: normalizedName, email: normalizedEmail, password });
    const token = signToken(user._id);
    res.status(201).cookie('token', token, cookieOptions(true)).json({ user: user.toSafeObject() });
  } catch (err) {
    res.status(500).json({ message: 'Registration failed' });
  }
};

// POST /api/auth/login
exports.login = async (req, res) => {
  try {
    const { email, password, remember = true } = req.body;
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail || typeof password !== 'string') {
      return res.status(400).json({ message: 'Email and password are required' });
    }
    const user = await User.findOne({ email: normalizedEmail });
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }
    if (user.isBlocked) return res.status(403).json({ message: 'Account is blocked' });

    const token = signToken(user._id);
    res.cookie('token', token, cookieOptions(remember !== false)).json({ user: user.toSafeObject() });
  } catch (err) {
    res.status(500).json({ message: 'Login failed' });
  }
};

// GET /api/auth/me
exports.getMe = async (req, res) => {
  res.json({ user: req.user.toSafeObject() });
};

// POST /api/auth/logout
exports.logout = async (req, res) => {
  res.clearCookie('token', cookieOptions(false)).status(204).send();
};
