const express = require('express');
const { protect, approvedDeliveryOnly } = require('../middleware/auth');
const { applyDeliveryPartner, getMyDeliveryProfile, getMyAssignments, scanPackage, updateDeliveryStatus } = require('../controllers/deliveryController');

const router = express.Router();

router.use(protect);
router.post('/apply', applyDeliveryPartner);
router.get('/me', getMyDeliveryProfile);
router.get('/assignments', approvedDeliveryOnly, getMyAssignments);
router.post('/scan', approvedDeliveryOnly, scanPackage);
router.patch('/packages/:id/status', approvedDeliveryOnly, updateDeliveryStatus);

module.exports = router;
