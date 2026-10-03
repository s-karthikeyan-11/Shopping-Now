const SellerProfile = require('../models/SellerProfile');
const User = require('../models/User');
const Product = require('../models/Product');
const Order = require('../models/Order');
const { decryptPayoutAccount, encryptPayoutAccount, maskAccountNumber } = require('../services/sellerPayoutData');

const isTruthy = (value) => typeof value === 'string' ? value.trim().length > 0 : Boolean(value);

exports.applySeller = async (req, res) => {
  try {
    const { businessName, contactNumber, gstNumber, businessAddress, payoutAccount, verificationDocuments } = req.body;

    if (!isTruthy(businessName) || !isTruthy(contactNumber) || !isTruthy(businessAddress)) {
      return res.status(400).json({ message: 'Business name, contact number, and business address are required.' });
    }
    if (verificationDocuments !== undefined && (!Array.isArray(verificationDocuments) || verificationDocuments.length > 10)) {
      return res.status(400).json({ message: 'Provide no more than 10 verification documents' });
    }
    const documents = (verificationDocuments || []).map((document) => {
      const name = typeof document?.name === 'string' ? document.name.trim() : '';
      const url = typeof document?.url === 'string' ? document.url.trim() : '';
      let validUrl = false;
      try {
        validUrl = new URL(url).protocol === 'https:';
      } catch {
        validUrl = false;
      }
      return name && name.length <= 100 && url.length <= 2048 && validUrl ? { name, url, status: 'pending' } : null;
    });
    if (documents.includes(null)) return res.status(400).json({ message: 'Verification documents need a name and a valid HTTPS URL' });

    const existing = await SellerProfile.findOne({ user: req.user._id }).select('+payoutAccountEncrypted');
    const hasSubmittedPayoutAccount = payoutAccount && typeof payoutAccount === 'object'
      && Object.values(payoutAccount).some((value) => String(value || '').trim());
    const existingPayoutAccount = existing?.payoutAccountEncrypted
      ? decryptPayoutAccount(existing)
      : existing?.payoutAccount;
    const sensitivePayoutAccount = hasSubmittedPayoutAccount
      ? { ...existingPayoutAccount, ...payoutAccount }
      : existingPayoutAccount;
    const payoutAccountEncrypted = sensitivePayoutAccount?.accountNumber
      ? existing?.payoutAccountEncrypted && !hasSubmittedPayoutAccount
        ? existing.payoutAccountEncrypted
        : encryptPayoutAccount(sensitivePayoutAccount)
      : existing?.payoutAccountEncrypted;
    const safePayoutAccount = sensitivePayoutAccount ? {
      bankName: sensitivePayoutAccount.bankName || '',
      accountHolderName: sensitivePayoutAccount.accountHolderName || '',
      accountNumber: '',
      ifscCode: sensitivePayoutAccount.ifscCode || '',
    } : existing?.payoutAccount || {};
    const profile = await SellerProfile.findOneAndUpdate(
      { user: req.user._id },
      {
        user: req.user._id,
        businessName,
        contactNumber,
        gstNumber: gstNumber || '',
        businessAddress,
        payoutAccount: safePayoutAccount,
        ...(payoutAccountEncrypted ? { payoutAccountEncrypted } : {}),
        ...(hasSubmittedPayoutAccount ? { razorpayXContactId: '', razorpayXFundAccountId: '' } : {}),
        verificationDocuments: documents,
        status: existing?.status === 'rejected' ? 'pending' : 'pending',
        complianceStatus: 'pending',
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    await User.findByIdAndUpdate(req.user._id, { role: 'seller' });
    req.user.role = 'seller';

    res.status(existing ? 200 : 201).json({
      message: 'Seller application submitted successfully. The admin will review it.',
      profile,
    });
  } catch (error) {
    res.status(500).json({ message: 'Seller application failed.' });
  }
};

exports.getSellerProfile = async (req, res) => {
  try {
    const profile = await SellerProfile.findOne({ user: req.user._id }).select('+payoutAccountEncrypted').lean();
    if (profile) {
      const payoutAccount = profile.payoutAccountEncrypted ? decryptPayoutAccount(profile) : profile.payoutAccount;
      profile.payoutAccount = { ...profile.payoutAccount, accountNumber: maskAccountNumber(payoutAccount.accountNumber) };
      delete profile.payoutAccountEncrypted;
    }
    res.json({
      user: req.user.toSafeObject(),
      profile,
      status: profile?.status || 'pending',
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to load seller profile.' });
  }
};

exports.getSellerOverview = async (req, res) => {
  try {
    const sellerId = req.user._id;
    const products = await Product.find({ seller: sellerId }).lean();
    const productIds = products.map((product) => product._id);
    const productIdStrings = new Set(productIds.map((id) => id.toString()));

    const orders = await Order.find({ items: { $elemMatch: { product: { $in: productIds } } } }).lean();

    let totalRevenue = 0;
    let totalOrders = 0;
    let totalUnits = 0;
    const recentOrders = [];

    for (const order of orders) {
      const items = Array.isArray(order.items) ? order.items : [];
      const sellerItems = items.filter((item) => {
        const itemProductId = item && item.product ? String(item.product) : '';
        return itemProductId && productIdStrings.has(itemProductId);
      });

      if (!sellerItems.length) continue;

      totalOrders += 1;
      const sellerRevenue = sellerItems.reduce((sum, item) => sum + Number(item.lineTotal || 0), 0);
      totalRevenue += sellerRevenue;
      totalUnits += sellerItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0);

      recentOrders.push({
        _id: order._id,
        status: order.status,
        createdAt: order.createdAt,
        totalAmount: Number(order.totalAmount || 0),
        sellerRevenue: Number(sellerRevenue.toFixed(2)),
      });
    }

    const lowStockProducts = products.filter((product) => Number(product.stock) <= Number(product.lowStockThreshold || 5)).length;

    res.json({
      stats: {
        totalProducts: products.length,
        activeProducts: products.filter((product) => product.isActive !== false).length,
        lowStockProducts,
        totalOrders,
        totalRevenue: Number(totalRevenue.toFixed(2)),
        totalUnits,
      },
      recentOrders: recentOrders.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)).slice(0, 5),
    });
  } catch (error) {
    console.error('Seller overview error:', error);
    res.status(500).json({ message: 'Failed to load seller overview.' });
  }
};

exports.listSellerApplications = async (req, res) => {
  try {
    const filter = req.query.status ? { status: req.query.status } : {};
    const profiles = await SellerProfile.find(filter).select('+payoutAccountEncrypted').populate('user', 'name email role isBlocked createdAt');
    res.json(profiles.map((profile) => {
      const safeProfile = profile.toObject();
      const payoutAccount = profile.payoutAccountEncrypted ? decryptPayoutAccount(profile) : safeProfile.payoutAccount;
      safeProfile.payoutAccount = {
        ...safeProfile.payoutAccount,
        accountNumber: maskAccountNumber(payoutAccount?.accountNumber),
      };
      delete safeProfile.payoutAccountEncrypted;
      return safeProfile;
    }));
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch seller applications.' });
  }
};

exports.updateSellerCompliance = async (req, res) => {
  const { status } = req.body;
  const note = typeof req.body.note === 'string' ? req.body.note.trim() : '';
  if (!['pending', 'verified', 'rejected'].includes(status) || note.length > 500) {
    return res.status(400).json({ message: 'Provide a valid compliance status and note' });
  }

  try {
    const profile = await SellerProfile.findById(req.params.id).select('+payoutAccountEncrypted');
    if (!profile) return res.status(404).json({ message: 'Seller profile not found' });
    if (status === 'verified') {
      const account = profile.payoutAccountEncrypted ? decryptPayoutAccount(profile) : profile.payoutAccount || {};
      if (profile.status !== 'approved') {
        return res.status(409).json({ message: 'Seller application must be approved before payout compliance can be cleared' });
      }
      const validAccount = Boolean(account.bankName && account.accountHolderName)
        && /^\d{6,34}$/.test(account.accountNumber || '')
        && /^[A-Z]{4}0[A-Z0-9]{6}$/i.test(account.ifscCode || '');
      const approvedDocuments = profile.verificationDocuments.length > 0
        && profile.verificationDocuments.every((document) => document.status === 'approved');
      if (!validAccount || !approvedDocuments) {
        return res.status(409).json({ message: 'Verify bank details and approve all verification documents before clearing compliance' });
      }
    }

    profile.complianceStatus = status;
    profile.complianceNote = note;
    await profile.save();
    res.json({ message: 'Seller compliance updated', complianceStatus: profile.complianceStatus });
  } catch (error) {
    res.status(500).json({ message: 'Failed to update seller compliance' });
  }
};

exports.updateSellerDocument = async (req, res) => {
  const { status } = req.body;
  const note = typeof req.body.note === 'string' ? req.body.note.trim() : '';
  if (!['pending', 'approved', 'rejected'].includes(status) || note.length > 500) {
    return res.status(400).json({ message: 'Provide a valid document status and note' });
  }
  try {
    const profile = await SellerProfile.findById(req.params.id);
    if (!profile) return res.status(404).json({ message: 'Seller profile not found' });
    const document = profile.verificationDocuments.id(req.params.documentId);
    if (!document) return res.status(404).json({ message: 'Verification document not found' });
    document.status = status;
    document.reviewNote = note;
    document.reviewedAt = new Date();
    if (status !== 'approved') {
      profile.complianceStatus = status === 'rejected' ? 'rejected' : 'pending';
    } else if (profile.complianceStatus === 'rejected') {
      profile.complianceStatus = 'pending';
    }
    await profile.save();
    res.json({ message: 'Verification document updated', status: document.status });
  } catch (error) {
    res.status(500).json({ message: 'Failed to update verification document' });
  }
};

exports.updateSellerCommission = async (req, res) => {
  const commissionRate = Number(req.body.commissionRate);
  if (!Number.isFinite(commissionRate) || commissionRate < 0 || commissionRate > 100) {
    return res.status(400).json({ message: 'Commission rate must be between 0 and 100 percent' });
  }
  try {
    const profile = await SellerProfile.findByIdAndUpdate(
      req.params.id,
      { $set: { commissionRate } },
      { new: true, runValidators: true }
    ).select('businessName commissionRate complianceStatus');
    if (!profile) return res.status(404).json({ message: 'Seller profile not found' });
    res.json(profile);
  } catch (error) {
    res.status(500).json({ message: 'Failed to update seller commission' });
  }
};

exports.updateSellerStatus = async (req, res) => {
  try {
    const { status, rejectionReason } = req.body;
    if (!['approved', 'rejected', 'pending'].includes(status)) {
      return res.status(400).json({ message: 'Status must be approved, rejected, or pending.' });
    }

    const profile = await SellerProfile.findById(req.params.id);
    if (!profile) {
      return res.status(404).json({ message: 'Seller profile not found.' });
    }

    profile.status = status;
    if (status === 'rejected') {
      profile.rejectionReason = rejectionReason || 'Seller documentation requires review.';
    } else {
      profile.rejectionReason = '';
    }
    await profile.save();

    await User.findByIdAndUpdate(profile.user, {
      role: status === 'approved' ? 'seller' : 'user',
    });

    res.json({ message: 'Seller status updated.', profile });
  } catch (error) {
    res.status(500).json({ message: 'Failed to update seller status.' });
  }
};
