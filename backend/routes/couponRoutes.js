const express = require('express');
const router = express.Router();
const { protect, customerOnly } = require('../middleware/auth');
const { validateCheckoutCoupon } = require('../controllers/orderController');

router.post('/validate', protect, customerOnly, validateCheckoutCoupon);

module.exports = router;