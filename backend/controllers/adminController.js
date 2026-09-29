const User = require('../models/User');
const Product = require('../models/Product');
const Order = require('../models/Order');

const errorStatus = (err) => (err.name === 'ValidationError' || err.name === 'CastError' ? 400 : 500);

// GET /api/admin/dashboard
exports.getDashboard = async (req, res) => {
  try {
    const [totalUsers, totalProducts, totalOrders, salesSummary, lowStockProducts, statusCounts] = await Promise.all([
      User.countDocuments({ role: 'user' }),
      Product.countDocuments(),
      Order.countDocuments(),
      Order.aggregate([
        { $match: { status: 'Delivered' } },
        { $group: { _id: null, totalSales: { $sum: '$totalAmount' } } },
      ]),
      Product.aggregate([
        { $match: { $expr: { $lte: ['$stock', '$lowStockThreshold'] } } },
        { $project: { name: 1, stock: 1, lowStockThreshold: 1 } },
      ]),
      Order.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    ]);

    const totalSales = salesSummary[0]?.totalSales || 0;

    res.json({
      totalUsers,
      totalProducts,
      totalOrders,
      totalSales: +totalSales.toFixed(2),
      lowStockProducts,
      ordersByStatus: statusCounts.reduce((acc, s) => ({ ...acc, [s._id]: s.count }), {}),
    });
  } catch (err) {
    res.status(errorStatus(err)).json({ message: 'Failed to load dashboard' });
  }
};

// GET /api/admin/users
exports.getUsers = async (req, res) => {
  try {
    const users = await User.find({ role: 'user' }).select('-password -cart').sort({ createdAt: -1 });
    res.json(users);
  } catch (err) {
    res.status(errorStatus(err)).json({ message: 'Failed to fetch users' });
  }
};

// PUT /api/admin/users/:id/block  { isBlocked }
exports.setUserBlocked = async (req, res) => {
  try {
    const { isBlocked } = req.body;
    if (typeof isBlocked !== 'boolean') {
      return res.status(400).json({ message: 'isBlocked must be a boolean' });
    }
    const user = await User.findOneAndUpdate(
      { _id: req.params.id, role: 'user' },
      { isBlocked },
      { new: true }
    ).select('-password -cart');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(errorStatus(err)).json({ message: 'Failed to update user' });
  }
};

// DELETE /api/admin/users/:id
exports.deleteUser = async (req, res) => {
  try {
    const user = await User.findOne({ _id: req.params.id, role: 'user' });
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (await Order.exists({ user: user._id })) {
      return res.status(409).json({ message: 'Users with order history cannot be deleted; block the account instead' });
    }
    await user.deleteOne();
    res.json({ message: 'User deleted' });
  } catch (err) {
    res.status(errorStatus(err)).json({ message: 'Failed to delete user' });
  }
};
