const Coupon = require('../models/Coupon');

const parseCoupon = (body) => {
  const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : '';
  const discountType = body.discountType;
  const discountValue = Number(body.discountValue);
  const minOrderAmount = Number(body.minOrderAmount ?? 0);
  const maxRedemptions = body.maxRedemptions === '' || body.maxRedemptions == null ? undefined : Number(body.maxRedemptions);
  const perUserLimit = body.perUserLimit === '' || body.perUserLimit == null ? undefined : Number(body.perUserLimit);
  const cashbackPercent = Number(body.cashbackPercent ?? 0);
  const startsAt = new Date(body.startsAt || Date.now());
  const expiresAt = new Date(body.expiresAt);
  const isActive = body.isActive !== false;
  const maxDiscount = body.maxDiscount === '' || body.maxDiscount == null ? undefined : Number(body.maxDiscount);

  if (!/^[A-Z0-9_-]{2,32}$/.test(code)) return { error: 'Coupon code must be 2-32 letters, numbers, hyphens, or underscores' };
  if (!['percentage', 'fixed'].includes(discountType)) return { error: 'Choose a valid discount type' };
  if (!Number.isFinite(discountValue) || discountValue <= 0 || (discountType === 'percentage' && discountValue > 100)) {
    return { error: 'Discount value is outside the allowed range' };
  }
  if (!Number.isFinite(minOrderAmount) || minOrderAmount < 0) return { error: 'Minimum order amount must be zero or more' };
  if (maxDiscount !== undefined && (!Number.isFinite(maxDiscount) || maxDiscount <= 0)) {
    return { error: 'Maximum discount must be greater than zero' };
  }
  if (maxRedemptions !== undefined && (!Number.isSafeInteger(maxRedemptions) || maxRedemptions < 1)) {
    return { error: 'Maximum redemptions must be a whole number greater than zero' };
  }
  if (perUserLimit !== undefined && (!Number.isSafeInteger(perUserLimit) || perUserLimit < 1)) {
    return { error: 'Per-customer limit must be a whole number greater than zero' };
  }
  if (!Number.isFinite(cashbackPercent) || cashbackPercent < 0 || cashbackPercent > 100) {
    return { error: 'Cashback must be between zero and 100 percent' };
  }
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(expiresAt.getTime()) || expiresAt <= startsAt) {
    return { error: 'Enter a valid promotion start and end date' };
  }
  if (typeof body.isActive !== 'undefined' && typeof body.isActive !== 'boolean') {
    return { error: 'Promotion active state must be true or false' };
  }

  return {
    value: {
      code,
      discountType,
      discountValue,
      ...(discountType === 'percentage' && maxDiscount !== undefined ? { maxDiscount } : {}),
      minOrderAmount,
      ...(maxRedemptions !== undefined ? { maxRedemptions } : {}),
      ...(perUserLimit !== undefined ? { perUserLimit } : {}),
      cashbackPercent,
      startsAt,
      expiresAt,
      isActive,
    },
  };
};

const sendCouponError = (res, err, fallback) => {
  if (err.code === 11000) return res.status(409).json({ message: 'A promotion with this code already exists' });
  if (err.name === 'ValidationError' || err.name === 'CastError') return res.status(400).json({ message: 'Promotion details are invalid' });
  return res.status(500).json({ message: fallback });
};

exports.listCoupons = async (req, res) => {
  try {
    res.json(await Coupon.find().sort({ createdAt: -1 }).lean());
  } catch (err) {
    sendCouponError(res, err, 'Failed to load promotions');
  }
};

exports.createCoupon = async (req, res) => {
  const parsed = parseCoupon(req.body);
  if (parsed.error) return res.status(400).json({ message: parsed.error });
  try {
    res.status(201).json(await Coupon.create(parsed.value));
  } catch (err) {
    sendCouponError(res, err, 'Failed to create promotion');
  }
};

exports.updateCoupon = async (req, res) => {
  const parsed = parseCoupon(req.body);
  if (parsed.error) return res.status(400).json({ message: parsed.error });
  try {
    const update = { $set: parsed.value };
    const unset = {};
    if (!Object.hasOwn(parsed.value, 'maxDiscount')) unset.maxDiscount = 1;
    if (!Object.hasOwn(parsed.value, 'maxRedemptions')) unset.maxRedemptions = 1;
    if (!Object.hasOwn(parsed.value, 'perUserLimit')) unset.perUserLimit = 1;
    if (Object.keys(unset).length) update.$unset = unset;
    const coupon = await Coupon.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
    if (!coupon) return res.status(404).json({ message: 'Promotion not found' });
    res.json(coupon);
  } catch (err) {
    sendCouponError(res, err, 'Failed to update promotion');
  }
};