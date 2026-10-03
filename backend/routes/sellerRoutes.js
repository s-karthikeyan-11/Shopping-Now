const express = require('express');
const { applySeller, getSellerProfile, getSellerOverview, listSellerApplications, updateSellerStatus, updateSellerCompliance, updateSellerDocument, updateSellerCommission } = require('../controllers/sellerController');
const { getSellerSettlements } = require('../controllers/settlementController');
const { protect, adminOnly, sellerOnly } = require('../middleware/auth');

const router = express.Router();

router.post('/apply', protect, applySeller);
router.get('/me', protect, sellerOnly, getSellerProfile);
router.get('/overview', protect, sellerOnly, getSellerOverview);
router.get('/payouts', protect, sellerOnly, getSellerSettlements);
router.get('/applications', protect, adminOnly, listSellerApplications);
router.patch('/:id/status', protect, adminOnly, updateSellerStatus);
router.patch('/:id/compliance', protect, adminOnly, updateSellerCompliance);
router.patch('/:id/documents/:documentId', protect, adminOnly, updateSellerDocument);
router.patch('/:id/commission', protect, adminOnly, updateSellerCommission);

module.exports = router;
