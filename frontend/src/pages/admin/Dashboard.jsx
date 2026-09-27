import React, { useEffect, useState } from 'react';
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

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-slate-900">Dashboard</h2>
      </div>

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {[
          { label: 'Total users', value: stats.totalUsers },
          { label: 'Total products', value: stats.totalProducts },
          { label: 'Total orders', value: stats.totalOrders },
          { label: 'Total sales', value: `₹${Number(stats.totalSales || 0).toFixed(2)}` },
        ].map((item) => (
          <div key={item.label} className="rounded-[24px] border border-slate-200 bg-slate-50 p-5 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{item.label}</div>
            <div className="mt-3 text-3xl font-bold text-slate-900">{item.value}</div>
          </div>
        ))}
      </div>

      <div className="mt-8">
        <h3 className="text-xl font-bold text-slate-900">Orders by status</h3>
        <div className="mt-4 grid grid-cols-2 gap-4 xl:grid-cols-5">
          {statuses.map((s) => (
            <div key={s} className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm">
              <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{s}</div>
              <div className="mt-3 text-3xl font-bold text-slate-900">{stats.ordersByStatus[s] || 0}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-8">
        <h3 className="text-xl font-bold text-slate-900">Low stock products</h3>
        {stats.lowStockProducts.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-slate-600">
            No products are low on stock.
          </div>
        ) : (
          <div className="mt-4 overflow-hidden rounded-[24px] border border-slate-200">
            <table className="w-full border-collapse bg-white">
              <thead>
                <tr>
                  <th className="table-th">Product</th>
                  <th className="table-th">Stock</th>
                  <th className="table-th">Threshold</th>
                </tr>
              </thead>
              <tbody>
                {stats.lowStockProducts.map((p) => (
                  <tr key={p._id}>
                    <td className="table-td">{p.name}</td>
                    <td className="table-td text-rose-600">{p.stock}</td>
                    <td className="table-td">{p.lowStockThreshold}</td>
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
