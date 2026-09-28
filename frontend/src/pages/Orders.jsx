import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/axios';

const statusClass = {
  Pending: 'bg-amber-100 text-amber-800',
  Processing: 'bg-blue-100 text-blue-800',
  Shipped: 'bg-violet-100 text-violet-800',
  Delivered: 'bg-emerald-100 text-emerald-800',
  Cancelled: 'bg-rose-100 text-rose-800',
};

const Orders = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadOrders = () => {
    setLoading(true);
    setError('');
    api.get('/orders').then(({ data }) => setOrders(data)).catch((err) => setError(err.response?.data?.message || 'Your orders could not be loaded. Try again.')).finally(() => setLoading(false));
  };

  useEffect(() => {
    loadOrders();
  }, []);

  if (loading) {
    return (
      <div className="section-shell py-12">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 rounded bg-slate-200" />
          <div className="card space-y-3 p-5">
            <div className="h-5 w-44 rounded bg-slate-200" />
            <div className="h-4 w-32 rounded bg-slate-200" />
            <div className="h-16 rounded-xl bg-slate-200" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="section-shell py-10 sm:py-12">
      <div className="mb-8">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Orders</p>
        <h1 className="mt-2 text-4xl font-bold text-slate-900">My orders</h1>
      </div>

      {error && <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center"><p className="text-sm text-rose-800">{error}</p><button type="button" className="btn btn-secondary mt-4" onClick={loadOrders}>Try again</button></div>}

      {!error && orders.length === 0 ? (
        <div className="mx-auto max-w-2xl rounded-[32px] border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm">
          <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-slate-100 text-3xl">📦</div>
          <h2 className="text-2xl font-bold text-slate-900">No orders yet</h2>
          <p className="mt-3 text-slate-600">Your purchases will appear here once you place an order.</p>
          <button type="button" className="btn btn-primary mt-6" onClick={() => window.location.href = '/'}>
            Start shopping
          </button>
        </div>
      ) : !error && (
        <div className="space-y-4">
          {orders.map((o) => (
            <div className="card p-5 sm:p-6" key={o._id}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Order ID</p>
                  <h3 className="mt-2 text-xl font-bold text-slate-900">#{o._id.slice(-6).toUpperCase()}</h3>
                </div>
                <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${statusClass[o.status] || 'bg-slate-100 text-slate-700'}`}>
                  {o.status}
                </span>
              </div>

              <div className="mt-4 flex flex-col gap-2 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
                <span>{new Date(o.createdAt).toLocaleString()}</span>
                <span className="font-semibold text-slate-700">Total: ₹{Number(o.totalAmount || 0).toFixed(2)}</span>
              </div>

              <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <ul className="space-y-2 text-sm text-slate-700">
                  {o.items.map((it, idx) => (
                    <li key={idx} className="flex items-center justify-between gap-3">
                      <span>{it.name} × {it.quantity}</span>
                      <span className="font-medium">₹{Number(it.lineTotal || 0).toFixed(2)}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="mt-4 flex justify-end"><Link className="btn btn-secondary" to={`/order/${o._id}`}>Track order</Link></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Orders;
