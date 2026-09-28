const express = require('express');
const router = express.Router();
const { protect, customerOnly } = require('../middleware/auth');
const { placeOrder, getMyOrders, getOrderById } = require('../controllers/orderController');

router.use(protect);

router.post('/', customerOnly, placeOrder);
router.get('/', getMyOrders);
router.get('/:id', getOrderById);

module.exports = router;
