import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ArrowUpRight, PackageCheck } from 'lucide-react';
import api from '../../api/axios';
import { Link } from 'react-router-dom';

const currencyFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

const SalesTrendChart = ({ data }) => {
  if (!data || data.length === 0) {
    return (
      <div className="flex h-60 items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-500">
        No sales data yet.
      </div>
    );
  }

  const values = data.map((entry) => Number(entry.sales || 0));
  const maxValue = Math.max(...values, 1);
  const chartHeight = 180;
  const chartWidth = 560;
  const padding = 18;

  const points = values.map((value, index) => {
    const x = padding + (index * (chartWidth - padding * 2)) / Math.max(values.length - 1, 1);
    const y = chartHeight - padding - (value / maxValue) * (chartHeight - padding * 2);
    return `${x},${y}`;
  });

  const areaPoints = `${points[0]} ${points.map((point) => point).join(' ')} ${chartWidth - padding},${chartHeight - padding} ${padding},${chartHeight - padding}`;

  return (
    <div className="space-y-4">
      <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="h-52 w-full overflow-visible rounded-2xl bg-slate-50 p-2">
        <defs>
          <linearGradient id="salesAreaGradient" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#7c3aed" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#7c3aed" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {[0, 1, 2, 3].map((step) => {
          const y = padding + (step * (chartHeight - padding * 2)) / 3;
          return <line key={step} x1={padding} x2={chartWidth - padding} y1={y} y2={y} stroke="#e2e8f0" strokeDasharray="4 6" />;
        })}

        <polygon points={areaPoints} fill="url(#salesAreaGradient)" />
        <polyline points={points.join(' ')} fill="none" stroke="#7c3aed" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />

        {points.map((point, index) => {
          const [x, y] = point.split(',').map(Number);
          return (
            <g key={`${data[index].month}-${index}`}>
              <circle cx={x} cy={y} r="4.5" fill="#fff" stroke="#7c3aed" strokeWidth="3" />
            </g>
          );
        })}
      </svg>

      <div className="grid grid-cols-6 gap-2 text-center text-[11px] font-medium uppercase tracking-[0.12em] text-slate-500">
        {data.map((entry) => (
          <span key={entry.month}>{entry.month}</span>
        ))}
      </div>
    </div>
  );
};

const Dashboard = () => {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/admin/dashboard');
      setStats(data);
    } catch (requestError) {
      setStats(null);
      setError(requestError.response?.data?.message || 'The dashboard could not be loaded. Check that the API is running and try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-36 animate-pulse rounded bg-slate-200" />
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, idx) => (
            <div key={idx} className="h-32 animate-pulse rounded-[24px] bg-slate-200" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div role="alert" className="rounded-[24px] border border-rose-200 bg-rose-50 p-6 text-rose-900">
        <h2 className="text-xl font-bold">Dashboard unavailable</h2>
        <p className="mt-2 text-sm text-rose-700">{error || 'The dashboard did not return any data.'}</p>
        <button type="button" className="btn btn-primary mt-5" onClick={loadDashboard}>Try again</button>
      </div>
    );
  }

  const statuses = ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled'];
  const ordersByStatus = stats.ordersByStatus || {};
  const lowStockProducts = Array.isArray(stats.lowStockProducts) ? stats.lowStockProducts : [];
  const salesTrend = Array.isArray(stats.monthlySales) ? stats.monthlySales : [];
  const topSellingProducts = Array.isArray(stats.topSellingProducts) ? stats.topSellingProducts : [];
  const statusColors = {
    Pending: 'bg-amber-100 text-amber-700',
    Processing: 'bg-sky-100 text-sky-700',
    Shipped: 'bg-violet-100 text-violet-700',
    Delivered: 'bg-emerald-100 text-emerald-700',
    Cancelled: 'bg-rose-100 text-rose-700',
  };
  const totalOrders = Number(stats.totalOrders || 0);
  const deliveredOrders = Number(ordersByStatus.Delivered || 0);
  const activeFulfillment = ['Pending', 'Processing', 'Shipped']
    .reduce((sum, status) => sum + Number(ordersByStatus[status] || 0), 0);
  const deliveryCompletion = totalOrders ? Math.round((deliveredOrders / totalOrders) * 100) : 0;
  const averageOrderValue = deliveredOrders ? Number(stats.totalSales || 0) / deliveredOrders : 0;
  const currentMonthSales = Number(salesTrend[salesTrend.length - 1]?.sales || 0);
  const previousMonthSales = Number(salesTrend[salesTrend.length - 2]?.sales || 0);
  const monthOverMonthGrowth = previousMonthSales ? ((currentMonthSales - previousMonthSales) / previousMonthSales) * 100 : (currentMonthSales > 0 ? 100 : 0);

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Overview</p>
          <h2 className="mt-2 text-2xl font-bold text-slate-900 sm:text-[28px]">Dashboard</h2>
        </div>
        <div className="flex items-center gap-3">
          <span className="admin-badge border-slate-200 bg-slate-50 text-slate-600">Live store data</span>
          <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-emerald-700">
            <PackageCheck size={12} /> {activeFulfillment} active fulfillment{activeFulfillment === 1 ? '' : 's'}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Total users', value: stats.totalUsers, tone: 'from-slate-900 to-slate-700', icon: 'U' },
          { label: 'Total products', value: stats.totalProducts, tone: 'from-violet-600 to-indigo-500', icon: 'P' },
          { label: 'Total orders', value: stats.totalOrders, tone: 'from-emerald-500 to-teal-500', icon: 'O' },
          { label: 'Total sales', value: `₹${Number(stats.totalSales || 0).toFixed(2)}`, tone: 'from-amber-500 to-orange-500', icon: '₹' },
        ].map((item) => (
          <div key={item.label} className="overflow-hidden rounded-[26px] border border-slate-200 bg-gradient-to-br p-[1px] shadow-[0_14px_34px_rgba(15,23,42,0.05)]">
            <div className={`h-full rounded-[25px] bg-gradient-to-br ${item.tone} p-5 text-white`}>
              <div className="flex items-center justify-between gap-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/80">{item.label}</div>
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-sm font-bold">{item.icon}</div>
              </div>
              <div className="mt-5 text-3xl font-bold tracking-tight">{item.value}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
        <div>
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 className="text-xl font-bold text-slate-900">Orders by status</h3>
            <span className="text-sm text-slate-500">All orders</span>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {statuses.map((s) => (
              <div key={s} className="admin-card p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className={`admin-badge ${statusColors[s]}`}>{s}</span>
                </div>
                <div className="mt-5 text-3xl font-bold text-slate-900">{ordersByStatus[s] || 0}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="admin-card p-5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-lg font-bold text-slate-900">Operational health</h3>
            <PackageCheck className="text-emerald-600" size={18} />
          </div>

          <div className="mt-5 space-y-4 text-sm">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center justify-between text-slate-600">
                <span>Products needing restock</span>
                <span className={`font-semibold ${lowStockProducts.length ? 'text-amber-700' : 'text-emerald-700'}`}>{lowStockProducts.length}</span>
              </div>
              <div className="mt-2 h-2 rounded-full bg-slate-200">
                <div className={`h-2 rounded-full ${lowStockProducts.length ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: lowStockProducts.length ? '100%' : '0%' }} />
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center justify-between text-slate-600">
                <span>Delivery completion</span>
                <span className="font-semibold text-violet-700">{deliveryCompletion}%</span>
              </div>
              <div className="mt-2 h-2 rounded-full bg-slate-200">
                <div className="h-2 rounded-full bg-violet-500" style={{ width: `${deliveryCompletion}%` }} />
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center justify-between text-slate-600">
                <span>Orders delivered</span>
                <span className="font-semibold text-emerald-700">{deliveredOrders}</span>
              </div>
              <div className="mt-2 h-2 rounded-full bg-slate-200">
                <div className="h-2 rounded-full bg-emerald-500" style={{ width: `${deliveryCompletion}%` }} />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-[1.5fr_0.8fr]">
        <div className="admin-card p-5">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Reports</p>
              <h3 className="mt-2 text-xl font-bold text-slate-900">Sales overview</h3>
            </div>
            <div className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-700">
              {monthOverMonthGrowth >= 0 ? '+' : ''}{monthOverMonthGrowth.toFixed(1)}% MoM
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <div className="text-xs uppercase tracking-[0.12em] text-slate-500">This month</div>
              <div className="mt-2 text-2xl font-bold text-slate-900">{currencyFormatter.format(currentMonthSales)}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <div className="text-xs uppercase tracking-[0.12em] text-slate-500">Avg. order</div>
              <div className="mt-2 text-2xl font-bold text-slate-900">{currencyFormatter.format(averageOrderValue)}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <div className="text-xs uppercase tracking-[0.12em] text-slate-500">Delivered</div>
              <div className="mt-2 text-2xl font-bold text-slate-900">{deliveredOrders}</div>
            </div>
          </div>

          <div className="mt-6">
            <SalesTrendChart data={salesTrend} />
          </div>
        </div>

        <div className="admin-card p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 className="text-xl font-bold text-slate-900">Top products</h3>
            <span className="text-sm text-slate-500">By units sold</span>
          </div>

          <div className="space-y-3">
            {topSellingProducts.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
                No completed orders yet.
              </div>
            ) : (
              topSellingProducts.map((product, index) => (
                <div key={`${product.name}-${index}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-800">{product.name}</p>
                      <p className="text-xs uppercase tracking-[0.12em] text-slate-500">{product.unitsSold} sold</p>
                    </div>
                    <span className="rounded-full bg-violet-100 px-2.5 py-1 text-xs font-semibold text-violet-700">
                      #{index + 1}
                    </span>
                  </div>
                  <div className="mt-2 text-sm font-semibold text-slate-700">{currencyFormatter.format(product.revenue || 0)}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="mt-8">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-xl font-bold text-slate-900">Low stock products</h3>
          <span className="inline-flex items-center gap-2 text-sm text-amber-700">
            <AlertTriangle size={14} /> Needs attention
          </span>
        </div>

        {lowStockProducts.length === 0 ? (
          <div className="mt-4 rounded-[24px] border border-dashed border-slate-300 bg-slate-50 p-6 text-slate-600">
            No products are low on stock.
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-[24px] border border-slate-200">
            <table className="w-full min-w-[560px] border-collapse bg-white">
              <thead>
                <tr>
                  <th className="table-th">Product</th>
                  <th className="table-th">Stock</th>
                  <th className="table-th">Threshold</th>
                  <th className="table-th">Action</th>
                </tr>
              </thead>
              <tbody>
                {lowStockProducts.map((p) => (
                  <tr key={p._id}>
                    <td className="table-td font-medium text-slate-800">{p.name}</td>
                    <td className="table-td">
                      <span className="table-chip bg-rose-100 text-rose-700">{p.stock}</span>
                    </td>
                    <td className="table-td">{p.lowStockThreshold}</td>
                    <td className="table-td">
                      <Link to="/admin/products" className="inline-flex items-center gap-1 text-sm font-semibold text-slate-900 hover:text-slate-700">
                        Manage stock <ArrowUpRight size={14} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
