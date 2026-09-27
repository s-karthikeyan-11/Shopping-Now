const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { placeOrder, getMyOrders, getOrderById } = require('../controllers/orderController');

router.use(protect); // login required to order

router.post('/', placeOrder);
router.get('/', getMyOrders);
router.get('/:id', getOrderById);

module.exports = router;
