const express = require('express');
const router = express.Router();
const { protect, customerOnly, approvedSellerOnly } = require('../middleware/auth');
const {
  placeOrder,
  createRazorpayOrder,
  verifyRazorpayPayment,
  cancelRazorpayPayment,
  cancelMyOrder,
  requestOrderReturn,
  getMyOrders,
  getOrderById,
  getSellerOrders,
  updateSellerOrderStatus,
  createSellerShipment,
  cancelOrderShipment,
  getOrderTracking,
} = require('../controllers/orderController');

router.use(protect);

router.post('/razorpay', customerOnly, createRazorpayOrder);
router.post('/razorpay/verify', customerOnly, verifyRazorpayPayment);
router.post('/:id/payment/cancel', customerOnly, cancelRazorpayPayment);
router.post('/:id/cancel', customerOnly, cancelMyOrder);
router.post('/:id/return', customerOnly, requestOrderReturn);
router.post('/', customerOnly, placeOrder);
router.get('/seller', approvedSellerOnly, getSellerOrders);
router.post('/seller/:id/shipment', approvedSellerOnly, createSellerShipment);
router.post('/seller/:id/shipment/cancel', approvedSellerOnly, cancelOrderShipment);
router.patch('/seller/:id/status', approvedSellerOnly, updateSellerOrderStatus);
router.get('/', getMyOrders);
router.get('/:id/tracking', getOrderTracking);
router.get('/:id', getOrderById);

module.exports = router;
