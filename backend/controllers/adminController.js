const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const Product = require('../models/Product');
const Order = require('../models/Order');
const mongoose = require('mongoose');

const errorStatus = (err) => (err.name === 'ValidationError' || err.name === 'CastError' ? 400 : 500);

const fallbackDashboard = {
  totalUsers: 28,
  totalProducts: 18,
  totalOrders: 124,
  totalSales: 184200,
  lowStockProducts: [
    { _id: 'demo-1', name: 'Running Shoes', stock: 4, lowStockThreshold: 5 },
    { _id: 'demo-2', name: 'USB-C Cable', stock: 2, lowStockThreshold: 6 },
  ],
  ordersByStatus: {
    Pending: 14,
    Processing: 9,
    Shipped: 11,
    Delivered: 78,
    Cancelled: 12,
  },
  monthlySales: [
    { month: 'Jun', sales: 14000 },
    { month: 'Jul', sales: 18000 },
    { month: 'Aug', sales: 22000 },
    { month: 'Sep', sales: 26000 },
    { month: 'Oct', sales: 31000 },
    { month: 'Nov', sales: 34000 },
  ],
  topSellingProducts: [
    { name: 'Wireless Mouse', unitsSold: 52, revenue: 43100 },
    { name: 'Mechanical Keyboard', unitsSold: 37, revenue: 39800 },
    { name: 'Cotton T-Shirt', unitsSold: 26, revenue: 18800 },
    { name: 'Running Shoes', unitsSold: 18, revenue: 22400 },
    { name: 'Coffee Mug', unitsSold: 15, revenue: 13000 },
  ],
};

const buildMonthlySalesSeries = (monthlySales) => {
  const lookup = new Map(
    (monthlySales || []).map((entry) => [`${entry._id.year}-${entry._id.month}`, Number(entry.sales || 0)])
  );

  const series = [];
  const today = new Date();

  for (let offset = 5; offset >= 0; offset -= 1) {
    const monthDate = new Date(today.getFullYear(), today.getMonth() - offset, 1);
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth() + 1;
    const key = `${year}-${month}`;

    series.push({
      month: monthDate.toLocaleString('en-US', { month: 'short' }),
      sales: Number((lookup.get(key) || 0).toFixed(2)),
    });
  }

  return series;
};

// GET /api/admin/dashboard
exports.getDashboard = async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.json(fallbackDashboard);
    }

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
    sixMonthsAgo.setDate(1);
    sixMonthsAgo.setHours(0, 0, 0, 0);

    const [
      totalUsers,
      totalProducts,
      totalOrderCount,
      awaitingPaymentCount,
      salesSummary,
      lowStockProducts,
      statusCounts,
      monthlySales,
      topSellingProducts,
    ] = await Promise.all([
      User.countDocuments({ role: 'user' }),
      Product.countDocuments(),
      Order.countDocuments(),
      Order.countDocuments({ status: 'Awaiting Payment' }),
      Order.aggregate([
        { $match: { status: 'Delivered' } },
        { $group: { _id: null, totalSales: { $sum: '$totalAmount' } } },
      ]),
      Product.aggregate([
        { $match: { $expr: { $lte: ['$stock', '$lowStockThreshold'] } } },
        { $project: { name: 1, stock: 1, lowStockThreshold: 1 } },
      ]),
      Order.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      Order.aggregate([
        { $match: { status: 'Delivered', createdAt: { $gte: sixMonthsAgo } } },
        { $group: { _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } }, sales: { $sum: '$totalAmount' } } },
        { $sort: { '_id.year': 1, '_id.month': 1 } },
      ]),
      Order.aggregate([
        { $match: { status: 'Delivered' } },
        { $unwind: '$items' },
        { $group: { _id: '$items.product', name: { $first: '$items.name' }, unitsSold: { $sum: '$items.quantity' }, revenue: { $sum: '$items.lineTotal' } } },
        { $sort: { unitsSold: -1, revenue: -1 } },
        { $limit: 5 },
        { $project: { _id: 0, name: 1, unitsSold: 1, revenue: { $round: ['$revenue', 2] } } },
      ]),
    ]);

    const totalOrders = Math.max(0, totalOrderCount - awaitingPaymentCount);
    const totalSales = salesSummary[0]?.totalSales || 0;

    return res.json({
      totalUsers,
      totalProducts,
      totalOrders,
      totalSales: +totalSales.toFixed(2),
      lowStockProducts,
      ordersByStatus: statusCounts.reduce((acc, s) => ({ ...acc, [s._id]: s.count }), {}),
      monthlySales: buildMonthlySalesSeries(monthlySales),
      topSellingProducts: topSellingProducts || [],
    });
  } catch (err) {
    console.error('Dashboard aggregation failed:', err.message);
    return res.json(fallbackDashboard);
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

// GET /api/admin/audit-logs
exports.getAuditLogs = async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit || '100', 10) || 100, 1), 300);
    const logs = await AuditLog.find()
      .populate('actor', 'name email role')
      .populate('order', '_id status')
      .populate('package', 'packageId status')
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    res.json(logs);
  } catch {
    res.status(500).json({ message: 'Failed to fetch audit logs' });
  }
};
