const mongoose = require('mongoose');
const User = require('../models/User');
const Order = require('../models/Order');
const Package = require('../models/Package');
const Evidence = require('../models/Evidence');
const DeliveryPartnerProfile = require('../models/DeliveryPartnerProfile');
const { matchesPin, tokenHash } = require('../services/packageSecurity');
const { recordAuditEvent } = require('../services/auditLog');

const isValidId = (value) => mongoose.Types.ObjectId.isValid(value);
const validStatus = ['Picked Up', 'In Transit', 'Out for Delivery', 'Delivered', 'Failed Delivery'];
const safePackage = (pkg) => {
  const value = typeof pkg.toObject === 'function' ? pkg.toObject() : pkg;
  delete value.deliveryPinHash;
  delete value.deliveryPinEncrypted;
  delete value.qrTokenHash;
  delete value.qrTokenEncrypted;
  return value;
};

const safeProfile = (profile) => {
  const value = typeof profile.toObject === 'function' ? profile.toObject() : profile;
  return value;
};

exports.applyDeliveryPartner = async (req, res) => {
  try {
    const { contactNumber, vehicleType = '', vehicleNumber = '', serviceAreas = [], identityDocumentUrl = '' } = req.body;
    if (req.user.role !== 'user' && req.user.role !== 'delivery') return res.status(409).json({ message: 'Only customer accounts can apply as a delivery partner' });
    if (typeof contactNumber !== 'string' || !/^[0-9+()\-\s]{7,30}$/.test(contactNumber.trim())
      || typeof vehicleType !== 'string' || vehicleType.trim().length > 60
      || typeof vehicleNumber !== 'string' || vehicleNumber.trim().length > 30
      || !Array.isArray(serviceAreas) || serviceAreas.length > 20
      || serviceAreas.some((area) => typeof area !== 'string' || area.trim().length === 0 || area.trim().length > 80)) {
      return res.status(400).json({ message: 'Provide valid delivery-partner application details' });
    }
    if (identityDocumentUrl && (typeof identityDocumentUrl !== 'string' || identityDocumentUrl.length > 2048 || !identityDocumentUrl.startsWith('https://'))) {
      return res.status(400).json({ message: 'Identity document URL must be a valid HTTPS URL' });
    }
    const profile = await DeliveryPartnerProfile.findOneAndUpdate(
      { user: req.user._id },
      {
        user: req.user._id,
        contactNumber: contactNumber.trim(),
        vehicleType: vehicleType.trim(),
        vehicleNumber: vehicleNumber.trim().toUpperCase(),
        serviceAreas: serviceAreas.map((area) => area.trim()),
        identityDocumentUrl: identityDocumentUrl.trim(),
        status: 'pending',
        rejectionReason: '',
      },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
    );
    await recordAuditEvent(req, { action: 'delivery_partner.applied', entityType: 'DeliveryPartnerProfile', entityId: profile._id });
    res.status(201).json({ profile: safeProfile(profile), message: 'Delivery-partner application submitted for admin approval' });
  } catch {
    res.status(500).json({ message: 'Unable to submit delivery-partner application' });
  }
};

exports.getMyDeliveryProfile = async (req, res) => {
  try {
    const profile = await DeliveryPartnerProfile.findOne({ user: req.user._id }).lean();
    res.json({ profile });
  } catch {
    res.status(500).json({ message: 'Unable to load delivery-partner profile' });
  }
};

exports.listDeliveryApplications = async (req, res) => {
  try {
    const filter = req.query.status ? { status: req.query.status } : {};
    const profiles = await DeliveryPartnerProfile.find(filter).populate('user', 'name email isBlocked createdAt').sort({ createdAt: -1 });
    res.json(profiles.map(safeProfile));
  } catch {
    res.status(500).json({ message: 'Unable to load delivery-partner applications' });
  }
};

exports.updateDeliveryPartnerStatus = async (req, res) => {
  try {
    const { status, rejectionReason = '' } = req.body;
    if (!['approved', 'rejected', 'pending'].includes(status) || typeof rejectionReason !== 'string' || rejectionReason.trim().length > 500) {
      return res.status(400).json({ message: 'Provide a valid delivery-partner status and reason' });
    }
    const profile = await DeliveryPartnerProfile.findById(req.params.id);
    if (!profile) return res.status(404).json({ message: 'Delivery-partner profile not found' });
    profile.status = status;
    profile.rejectionReason = status === 'rejected' ? rejectionReason.trim() : '';
    await profile.save();
    await User.findByIdAndUpdate(profile.user, { role: status === 'approved' ? 'delivery' : 'user' });
    await recordAuditEvent(req, { action: `delivery_partner.${status}`, entityType: 'DeliveryPartnerProfile', entityId: profile._id });
    res.json({ profile: safeProfile(profile) });
  } catch {
    res.status(500).json({ message: 'Unable to update delivery-partner status' });
  }
};

exports.listPackages = async (req, res) => {
  try {
    const filter = req.query.status ? { status: req.query.status } : {};
    const packages = await Package.find(filter)
      .populate('order', 'status totalAmount shippingAddress user')
      .populate('seller', 'name email')
      .populate({ path: 'assignedDeliveryPartner', populate: { path: 'user', select: 'name email' } })
      .sort({ updatedAt: -1 })
      .limit(300)
      .lean();
    res.json(packages.map(safePackage));
  } catch {
    res.status(500).json({ message: 'Unable to load packages' });
  }
};

exports.assignPackage = async (req, res) => {
  try {
    const { deliveryPartnerId } = req.body;
    if (!isValidId(deliveryPartnerId)) return res.status(400).json({ message: 'A valid delivery-partner profile ID is required' });
    const [pkg, partner] = await Promise.all([
      Package.findById(req.params.id),
      DeliveryPartnerProfile.findOne({ _id: deliveryPartnerId, status: 'approved' }),
    ]);
    if (!pkg) return res.status(404).json({ message: 'Package not found' });
    if (!partner) return res.status(409).json({ message: 'Delivery partner must be approved before assignment' });
    if (!['Ready for Dispatch', 'Assigned'].includes(pkg.status)) return res.status(409).json({ message: 'Only a ready package can be assigned' });
    pkg.assignedDeliveryPartner = partner._id;
    pkg.status = 'Assigned';
    await pkg.save();
    await recordAuditEvent(req, {
      action: 'package.assigned_delivery_partner', entityType: 'Package', entityId: pkg._id, order: pkg.order, package: pkg._id,
      metadata: { deliveryPartnerId: String(partner._id) },
    });
    res.json({ package: safePackage(pkg) });
  } catch {
    res.status(500).json({ message: 'Unable to assign delivery partner' });
  }
};

exports.getMyAssignments = async (req, res) => {
  try {
    const profile = await DeliveryPartnerProfile.findOne({ user: req.user._id, status: 'approved' }).select('_id').lean();
    if (!profile) return res.status(403).json({ message: 'Approved delivery-partner access required' });
    const packages = await Package.find({ assignedDeliveryPartner: profile._id, status: { $nin: ['Delivered', 'Cancelled'] } })
      .populate('order', 'shippingAddress status totalAmount')
      .populate('seller', 'name email')
      .sort({ updatedAt: -1 })
      .limit(100)
      .lean();
    res.json(packages);
  } catch {
    res.status(500).json({ message: 'Unable to load assignments' });
  }
};

exports.scanPackage = async (req, res) => {
  try {
    const { packageId, verificationToken } = req.body;
    if (typeof packageId !== 'string' || typeof verificationToken !== 'string' || verificationToken.length < 20) {
      return res.status(400).json({ message: 'Package QR data is invalid' });
    }
    const profile = await DeliveryPartnerProfile.findOne({ user: req.user._id, status: 'approved' }).select('_id').lean();
    const pkg = await Package.findOne({ packageId: packageId.trim(), qrTokenHash: tokenHash(verificationToken) });
    if (!pkg) return res.status(404).json({ message: 'Package QR code is invalid' });
    if (!profile || String(pkg.assignedDeliveryPartner) !== String(profile._id)) return res.status(403).json({ message: 'This package is not assigned to you' });
    if (!['Assigned', 'Scanned', 'Picked Up'].includes(pkg.status)) return res.status(409).json({ message: 'This package cannot be scanned in its current state' });
    if (pkg.status === 'Assigned') {
      pkg.status = 'Scanned';
      pkg.scannedAt = new Date();
      await pkg.save();
      await recordAuditEvent(req, { action: 'package.qr_scanned', entityType: 'Package', entityId: pkg._id, order: pkg.order, package: pkg._id });
    }
    res.json({ package: safePackage(pkg) });
  } catch {
    res.status(500).json({ message: 'Unable to verify package QR code' });
  }
};

exports.updateDeliveryStatus = async (req, res) => {
  try {
    const { status, deliveryPin, failureReason = '' } = req.body;
    if (!validStatus.includes(status) || typeof failureReason !== 'string' || failureReason.trim().length > 500) {
      return res.status(400).json({ message: 'Provide a valid delivery status' });
    }
    const profile = await DeliveryPartnerProfile.findOne({ user: req.user._id, status: 'approved' }).select('_id').lean();
    if (!profile) return res.status(403).json({ message: 'Approved delivery-partner access required' });
    const pkg = await Package.findOne({ _id: req.params.id, assignedDeliveryPartner: profile._id }).select('+deliveryPinHash');
    if (!pkg) return res.status(404).json({ message: 'Assigned package not found' });
    const allowed = {
      Assigned: ['Picked Up'], Scanned: ['Picked Up'], 'Picked Up': ['In Transit', 'Failed Delivery'], 'In Transit': ['Out for Delivery', 'Failed Delivery'], 'Out for Delivery': ['Delivered', 'Failed Delivery'],
    };
    if (!allowed[pkg.status]?.includes(status)) return res.status(409).json({ message: `Cannot update ${pkg.status} package to ${status}` });
    if (status === 'Delivered') {
      if (!(await matchesPin(deliveryPin, pkg.deliveryPinHash))) return res.status(403).json({ message: 'Customer delivery PIN is invalid' });
      const proofCount = await Evidence.countDocuments({ package: pkg._id, type: 'delivery_proof', status: 'active', submittedBy: req.user._id });
      if (!proofCount) return res.status(409).json({ message: 'Upload delivery proof before completing delivery' });
    }
    pkg.status = status;
    if (status === 'Picked Up') pkg.pickedUpAt = new Date();
    if (status === 'Out for Delivery') pkg.outForDeliveryAt = new Date();
    if (status === 'Delivered') pkg.deliveredAt = new Date();
    if (status === 'Failed Delivery') pkg.failedDeliveryReason = failureReason.trim();
    await pkg.save();

    const order = await Order.findById(pkg.order);
    const fulfillment = order?.sellerShipments.id(pkg.sellerShipmentId);
    if (order && fulfillment) {
      if (status === 'Delivered') {
        fulfillment.status = 'Delivered';
        fulfillment.deliveredAt = pkg.deliveredAt;
      } else if (['Picked Up', 'In Transit', 'Out for Delivery'].includes(status)) {
        fulfillment.status = 'Shipped';
        fulfillment.shipmentStatus = status;
      }
      if (order.sellerShipments.length && order.sellerShipments.every((item) => ['Delivered', 'Cancelled'].includes(item.status))) {
        order.status = 'Delivered';
        order.deliveredAt = order.deliveredAt || new Date();
      } else if (order.sellerShipments.some((item) => item.status === 'Shipped')) {
        order.status = 'Shipped';
      }
      await order.save();
    }
    await recordAuditEvent(req, {
      action: `package.delivery_${status.toLowerCase().replace(/\s+/g, '_')}`,
      entityType: 'Package', entityId: pkg._id, order: pkg.order, package: pkg._id,
    });
    res.json({ package: safePackage(pkg) });
  } catch {
    res.status(500).json({ message: 'Unable to update delivery status' });
  }
};
