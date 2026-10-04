const express = require('express');
const { protect, approvedSellerOnly } = require('../middleware/auth');
const { createDispute, getMyDisputes, respondToDispute, getDisputeInspection } = require('../controllers/disputeController');

const router = express.Router();

router.use(protect);
router.post('/', createDispute);
router.get('/mine', getMyDisputes);
router.get('/:id/inspection', getDisputeInspection);
router.post('/:id/respond', approvedSellerOnly, respondToDispute);

module.exports = router;
