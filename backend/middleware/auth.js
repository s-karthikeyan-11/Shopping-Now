const jwt = require('jsonwebtoken');
const User = require('../models/User');
const SellerProfile = require('../models/SellerProfile');
const DeliveryPartnerProfile = require('../models/DeliveryPartnerProfile');

// Verifies JWT and attaches the user to req.user
const protect = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    const bearerToken = header?.startsWith('Bearer ') ? header.slice(7) : null;
    const token = bearerToken || req.cookies?.token;
    if (!token) {
      return res.status(401).json({ message: 'Not authorized, no token' });
    }
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password');
    if (!user) return res.status(401).json({ message: 'User no longer exists' });
    if (user.isBlocked) return res.status(403).json({ message: 'Account is blocked' });
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Not authorized, token failed' });
  }
};

// Requires req.user to have role 'admin'
const adminOnly = (req, res, next) => {
  if (req.user && req.user.role === 'admin') return next();
  return res.status(403).json({ message: 'Admin access required' });
};

const sellerOnly = (req, res, next) => {
  if (req.user && (req.user.role === 'seller' || req.user.role === 'admin')) return next();
  return res.status(403).json({ message: 'Seller access required' });
};

// A seller role alone is not sufficient for marketplace operations. This
// guards against an applicant publishing products before an administrator has
// approved their business and compliance documents.
const approvedSellerOnly = async (req, res, next) => {
  if (!req.user) return res.status(401).json({ message: 'Not authorized' });
  if (req.user.role === 'admin') return next();
  if (req.user.role !== 'seller') return res.status(403).json({ message: 'Approved seller access required' });
  try {
    const profile = await SellerProfile.findOne({ user: req.user._id }).select('status').lean();
    if (profile?.status !== 'approved') {
      return res.status(403).json({ message: 'Your seller application has not been approved yet' });
    }
    return next();
  } catch {
    return res.status(500).json({ message: 'Unable to verify seller approval' });
  }
};

const deliveryOnly = (req, res, next) => {
  if (req.user && (req.user.role === 'delivery' || req.user.role === 'admin')) return next();
  return res.status(403).json({ message: 'Delivery partner access required' });
};

const approvedDeliveryOnly = async (req, res, next) => {
  if (!req.user) return res.status(401).json({ message: 'Not authorized' });
  if (req.user.role === 'admin') return next();
  if (req.user.role !== 'delivery') return res.status(403).json({ message: 'Approved delivery partner access required' });
  try {
    const profile = await DeliveryPartnerProfile.findOne({ user: req.user._id }).select('status').lean();
    if (profile?.status !== 'approved') {
      return res.status(403).json({ message: 'Your delivery-partner application has not been approved yet' });
    }
    return next();
  } catch {
    return res.status(500).json({ message: 'Unable to verify delivery-partner approval' });
  }
};

const customerOnly = (req, res, next) => {
  if (req.user && req.user.role !== 'admin') return next();
  return res.status(403).json({ message: 'Only customers can place orders' });
};

module.exports = { protect, adminOnly, sellerOnly, approvedSellerOnly, deliveryOnly, approvedDeliveryOnly, customerOnly };
