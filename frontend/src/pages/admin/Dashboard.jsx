import React, { useEffect, useState } from 'react';
import { AlertTriangle, ArrowUpRight, PackageCheck, TrendingUp } from 'lucide-react';
import api from '../../api/axios';

const Dashboard = () => {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    api.get('/admin/dashboard').then(({ data }) => setStats(data));
  }, []);

  if (!stats) {
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

  const statuses = ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled'];
  const statusColors = {
    Pending: 'bg-amber-100 text-amber-700',
    Processing: 'bg-sky-100 text-sky-700',
    Shipped: 'bg-violet-100 text-violet-700',
    Delivered: 'bg-emerald-100 text-emerald-700',
    Cancelled: 'bg-rose-100 text-rose-700',
  };

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Overview</p>
          <h2 className="mt-2 text-2xl font-bold text-slate-900 sm:text-[28px]">Dashboard</h2>
        </div>
        <div className="flex items-center gap-3">
          <span className="admin-badge border-slate-200 bg-slate-50 text-slate-600">Updated today</span>
          <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-emerald-700">
            <TrendingUp size={12} /> +12.4% vs last week
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
            <span className="text-sm text-slate-500">Last 30 days</span>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {statuses.map((s) => (
              <div key={s} className="admin-card p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className={`admin-badge ${statusColors[s]}`}>{s}</span>
                </div>
                <div className="mt-5 text-3xl font-bold text-slate-900">{stats.ordersByStatus[s] || 0}</div>
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
                <span>Stock health</span>
                <span className="font-semibold text-emerald-700">91%</span>
              </div>
              <div className="mt-2 h-2 rounded-full bg-slate-200">
                <div className="h-2 w-[91%] rounded-full bg-emerald-500" />
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center justify-between text-slate-600">
                <span>Fulfillment rate</span>
                <span className="font-semibold text-violet-700">87%</span>
              </div>
              <div className="mt-2 h-2 rounded-full bg-slate-200">
                <div className="h-2 w-[87%] rounded-full bg-violet-500" />
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center justify-between text-slate-600">
                <span>Customer satisfaction</span>
                <span className="font-semibold text-amber-700">4.9/5</span>
              </div>
              <div className="mt-2 h-2 rounded-full bg-slate-200">
                <div className="h-2 w-[96%] rounded-full bg-amber-500" />
              </div>
            </div>
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

        {stats.lowStockProducts.length === 0 ? (
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
                {stats.lowStockProducts.map((p) => (
                  <tr key={p._id}>
                    <td className="table-td font-medium text-slate-800">{p.name}</td>
                    <td className="table-td">
                      <span className="table-chip bg-rose-100 text-rose-700">{p.stock}</span>
                    </td>
                    <td className="table-td">{p.lowStockThreshold}</td>
                    <td className="table-td">
                      <button type="button" className="inline-flex items-center gap-1 text-sm font-semibold text-slate-900 hover:text-slate-700">
                        Reorder <ArrowUpRight size={14} />
                      </button>
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
