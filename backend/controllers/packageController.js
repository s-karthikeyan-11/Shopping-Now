const crypto = require('crypto');
const mongoose = require('mongoose');
const QRCode = require('qrcode');
const Order = require('../models/Order');
const Package = require('../models/Package');
const Evidence = require('../models/Evidence');
const { createDeliveryPin, createVerificationToken, decrypt, encrypt, hashPin, tokenHash } = require('../services/packageSecurity');
const { recordAuditEvent } = require('../services/auditLog');

const isValidId = (value) => mongoose.Types.ObjectId.isValid(value);
const packageId = () => `PKG-${new Date().getUTCFullYear()}-${crypto.randomBytes(7).toString('hex').toUpperCase()}`;

const toSafePackage = (value) => {
  const pkg = typeof value.toObject === 'function' ? value.toObject() : value;
  const { qrTokenHash, qrTokenEncrypted, deliveryPinHash, deliveryPinEncrypted, ...safe } = pkg;
  return safe;
};

const findSellerShipment = (order, sellerId) =>
  order.sellerShipments.find((shipment) => String(shipment.seller) === String(sellerId));

const createQrCode = async (pkg) => {
  const token = decrypt(pkg.qrTokenEncrypted);
  const payload = JSON.stringify({ version: 1, packageId: pkg.packageId, verificationToken: token });
  return QRCode.toDataURL(payload, { errorCorrectionLevel: 'M', margin: 1, width: 360 });
};

exports.createPackage = async (req, res) => {
  try {
    const { orderId } = req.body;
    if (!isValidId(orderId)) return res.status(400).json({ message: 'A valid order ID is required' });
    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (['Cancelled', 'Delivered'].includes(order.status)) return res.status(409).json({ message: 'Packages cannot be created for this order state' });
    const fulfillment = findSellerShipment(order, req.user._id);
    if (!fulfillment) return res.status(403).json({ message: 'This order has no items for your seller account' });

    const existing = await Package.findOne({ order: order._id, seller: req.user._id }).select('+qrTokenEncrypted');
    if (existing) {
      return res.status(409).json({
        message: 'A package already exists for this seller fulfillment',
        package: toSafePackage(existing),
        qrCodeDataUrl: await createQrCode(existing),
      });
    }

    const verificationToken = createVerificationToken();
    const deliveryPin = createDeliveryPin();
    const pkg = await Package.create({
      order: order._id,
      seller: req.user._id,
      sellerShipmentId: fulfillment._id,
      packageId: packageId(),
      qrTokenHash: tokenHash(verificationToken),
      qrTokenEncrypted: encrypt(verificationToken),
      deliveryPinHash: await hashPin(deliveryPin),
      deliveryPinEncrypted: encrypt(deliveryPin),
      status: 'Packing',
    });
    fulfillment.package = pkg._id;
    if (fulfillment.status === 'Pending') fulfillment.status = 'Processing';
    await order.save();
    await recordAuditEvent(req, {
      action: 'package.created',
      entityType: 'Package',
      entityId: pkg._id,
      order: order._id,
      package: pkg._id,
      metadata: { packageId: pkg.packageId },
    });
    res.status(201).json({ package: toSafePackage(pkg), qrCodeDataUrl: await createQrCode(pkg) });
  } catch (err) {
    if (err?.code === 11000) return res.status(409).json({ message: 'A package already exists for this seller fulfillment' });
    res.status(500).json({ message: 'Unable to create package' });
  }
};

exports.getSellerPackageQr = async (req, res) => {
  try {
    if (!isValidId(req.params.id)) return res.status(400).json({ message: 'Invalid package ID' });
    const pkg = await Package.findById(req.params.id).select('+qrTokenEncrypted');
    if (!pkg) return res.status(404).json({ message: 'Package not found' });
    if (req.user.role !== 'admin' && String(pkg.seller) !== String(req.user._id)) {
      return res.status(403).json({ message: 'Not authorized to access this package QR code' });
    }
    res.json({ package: toSafePackage(pkg), qrCodeDataUrl: await createQrCode(pkg) });
  } catch {
    res.status(500).json({ message: 'Unable to generate package QR code' });
  }
};

exports.markPackageReady = async (req, res) => {
  try {
    if (!isValidId(req.params.id)) return res.status(400).json({ message: 'Invalid package ID' });
    const pkg = await Package.findOne({ _id: req.params.id, seller: req.user._id });
    if (!pkg) return res.status(404).json({ message: 'Package not found' });
    if (!['Created', 'Packing'].includes(pkg.status)) return res.status(409).json({ message: 'This package is not awaiting packing completion' });
    const packingEvidence = await Evidence.countDocuments({ package: pkg._id, type: 'packing', status: 'active' });
    if (!packingEvidence) return res.status(409).json({ message: 'Upload at least one packing evidence file before marking the package ready' });
    pkg.status = 'Ready for Dispatch';
    await pkg.save();
    await recordAuditEvent(req, {
      action: 'package.ready_for_dispatch', entityType: 'Package', entityId: pkg._id, order: pkg.order, package: pkg._id,
    });
    res.json({ package: toSafePackage(pkg) });
  } catch {
    res.status(500).json({ message: 'Unable to mark package ready for dispatch' });
  }
};

exports.getCustomerDeliveryPin = async (req, res) => {
  try {
    if (!isValidId(req.params.id)) return res.status(400).json({ message: 'Invalid package ID' });
    const pkg = await Package.findById(req.params.id).select('+deliveryPinEncrypted').populate('order', 'user');
    if (!pkg) return res.status(404).json({ message: 'Package not found' });
    if (String(pkg.order.user) !== String(req.user._id)) return res.status(403).json({ message: 'Not authorized to view this delivery PIN' });
    if (!['Out for Delivery', 'Delivered'].includes(pkg.status)) {
      return res.status(409).json({ message: 'The delivery PIN is available only when the package is out for delivery' });
    }
    res.json({ packageId: pkg.packageId, deliveryPin: decrypt(pkg.deliveryPinEncrypted) });
  } catch {
    res.status(500).json({ message: 'Unable to load delivery PIN' });
  }
};

exports.getMyPackages = async (req, res) => {
  try {
    const filter = req.user.role === 'seller' ? { seller: req.user._id } : {};
    const packages = await Package.find(filter).populate('order', 'user status totalAmount shippingAddress').sort({ createdAt: -1 }).limit(100).lean();
    res.json(packages.map(toSafePackage));
  } catch {
    res.status(500).json({ message: 'Unable to load packages' });
  }
};

exports.getOrderPackages = async (req, res) => {
  try {
    if (!isValidId(req.params.orderId)) return res.status(400).json({ message: 'Invalid order ID' });
    const order = await Order.findById(req.params.orderId).select('user');
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (req.user.role !== 'admin' && String(order.user) !== String(req.user._id)) {
      return res.status(403).json({ message: 'Not authorized to view packages for this order' });
    }
    const packages = await Package.find({ order: order._id }).sort({ createdAt: -1 }).lean();
    res.json(packages.map(toSafePackage));
  } catch {
    res.status(500).json({ message: 'Unable to load packages' });
  }
};

exports.toSafePackage = toSafePackage;
