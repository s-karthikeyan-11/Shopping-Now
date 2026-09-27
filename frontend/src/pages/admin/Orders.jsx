import React, { useEffect, useState } from 'react';
import api from '../../api/axios';

const STATUSES = ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled'];

const AdminOrders = () => {
  const [orders, setOrders] = useState([]);
  const [filter, setFilter] = useState('');

  const load = (status) =>
    api.get('/admin/orders', { params: status ? { status } : {} }).then(({ data }) => setOrders(data));

  useEffect(() => {
    load();
  }, []);

  const handleFilter = (e) => {
    const status = e.target.value;
    setFilter(status);
    load(status);
  };

  const handleStatusChange = async (id, status) => {
    await api.put(`/admin/orders/${id}/status`, { status });
    load(filter);
  };

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-2xl font-bold text-slate-900">Orders</h2>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          Filter by status:
          <select className="input w-auto min-w-[180px]" value={filter} onChange={handleFilter}>
            <option value="">All</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
      </div>

      <div className="overflow-hidden rounded-[24px] border border-slate-200">
        <table className="w-full border-collapse bg-white">
          <thead>
            <tr>
              <th className="table-th">Order</th><th className="table-th">Customer</th><th className="table-th">Items</th>
              <th className="table-th">Total</th><th className="table-th">Status</th><th className="table-th">Placed</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o._id}>
                <td className="table-td">#{o._id.slice(-6).toUpperCase()}</td>
                <td className="table-td">
                  {o.user?.name}<br /><span className="text-xs text-slate-500">{o.user?.email}</span>
                </td>
                <td className="table-td">{o.items.map((it) => `${it.name} x${it.quantity}`).join(', ')}</td>
                <td className="table-td">₹{Number(o.totalAmount || 0).toFixed(2)}</td>
                <td className="table-td">
                  <select className="input min-w-[140px]" value={o.status} onChange={(e) => handleStatusChange(o._id, e.target.value)}>
                    {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </td>
                <td className="table-td">{new Date(o.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AdminOrders;
