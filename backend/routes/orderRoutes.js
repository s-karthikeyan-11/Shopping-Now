const express = require('express');
const router = express.Router();
const { protect, customerOnly } = require('../middleware/auth');
const {
  placeOrder,
  createRazorpayOrder,
  verifyRazorpayPayment,
  cancelRazorpayPayment,
  getMyOrders,
  getOrderById,
} = require('../controllers/orderController');

router.use(protect);

router.post('/razorpay', customerOnly, createRazorpayOrder);
router.post('/razorpay/verify', customerOnly, verifyRazorpayPayment);
router.post('/:id/payment/cancel', customerOnly, cancelRazorpayPayment);
router.post('/', customerOnly, placeOrder);
router.get('/', getMyOrders);
router.get('/:id', getOrderById);

module.exports = router;
