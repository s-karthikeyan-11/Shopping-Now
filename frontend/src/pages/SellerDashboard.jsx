import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/axios';

const formatCurrency = (value) => `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

const SellerDashboard = () => {
  const [profile, setProfile] = useState(null);
  const [overview, setOverview] = useState({ stats: {}, recentOrders: [] });
  const [payoutSummary, setPayoutSummary] = useState({ pendingAmount: 0, paidAmount: 0, onHoldAmount: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadSellerData = async () => {
      try {
        const [profileResponse, overviewResponse, payoutResponse] = await Promise.all([
          api.get('/sellers/me'),
          api.get('/sellers/overview'),
          api.get('/sellers/payouts'),
        ]);

        setProfile(profileResponse.data);
        setOverview(overviewResponse.data);
        setPayoutSummary(payoutResponse.data.summary);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    loadSellerData();
  }, []);

  if (loading) {
    return <div className="p-8 text-slate-500">Loading seller dashboard...</div>;
  }

  const sellerStatus = profile?.status || 'pending';
  const sellerUser = profile?.user || {};
  const sellerInfo = profile?.profile || {};
  const stats = overview?.stats || {};

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 p-8 text-white shadow-lg">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.2em] text-emerald-100">Seller portal</p>
              <h1 className="mt-3 text-3xl font-bold">Welcome, {sellerUser.name || 'Seller'}</h1>
            </div>
            <div className="rounded-full bg-white/10 px-4 py-2 text-sm font-medium backdrop-blur-sm">
              Status: <span className="font-semibold capitalize">{sellerStatus}</span>
            </div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Total sales</p>
            <p className="mt-3 text-3xl font-bold text-slate-900">{formatCurrency(stats.totalRevenue)}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Orders</p>
            <p className="mt-3 text-3xl font-bold text-slate-900">{stats.totalOrders || 0}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Units sold</p>
            <p className="mt-3 text-3xl font-bold text-slate-900">{stats.totalUnits || 0}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Payout balance</p>
            <p className="mt-3 text-3xl font-bold text-slate-900">{formatCurrency(payoutSummary.pendingAmount)}</p>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Seller operations</h2>
              <p className="mt-1 text-sm text-slate-600">Manage listings, stock, and catalog visibility.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link to="/seller/products" className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-emerald-500">
                Manage inventory
              </Link>
              <Link to="/seller/orders" className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-100">
                Manage orders
              </Link>
              <Link to="/seller/payouts" className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-100">
                View payouts
              </Link>
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-slate-900">Seller profile</h2>
            <div className="mt-5 space-y-4 text-sm text-slate-700">
              <div className="flex justify-between border-b border-slate-100 pb-3">
                <span>Business name</span>
                <strong>{sellerInfo.businessName || 'Not submitted'}</strong>
              </div>
              <div className="flex justify-between border-b border-slate-100 pb-3">
                <span>Contact</span>
                <strong>{sellerInfo.contactNumber || 'Not submitted'}</strong>
              </div>
              <div className="flex justify-between border-b border-slate-100 pb-3">
                <span>GST number</span>
                <strong>{sellerInfo.gstNumber || 'Not provided'}</strong>
              </div>
              <div className="flex justify-between border-b border-slate-100 pb-3">
                <span>Business address</span>
                <strong>{sellerInfo.businessAddress || 'Not provided'}</strong>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-slate-900">Operational checklist</h2>
            <ul className="mt-5 space-y-3 text-sm text-slate-600">
              <li className="rounded-lg bg-emerald-50 p-3 text-emerald-700">{stats.activeProducts || 0} active listings</li>
              <li className="rounded-lg bg-sky-50 p-3 text-sky-700">{stats.lowStockProducts || 0} items need restock</li>
              <li className="rounded-lg bg-amber-50 p-3 text-amber-700">{stats.totalProducts || 0} catalog items in store</li>
              <li className="rounded-lg bg-indigo-50 p-3 text-indigo-700">{formatCurrency(payoutSummary.onHoldAmount)} held for compliance or payment confirmation</li>
            </ul>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-xl font-semibold text-slate-900">Recent sales activity</h2>
            <span className="text-sm text-slate-500">Last 5 orders</span>
          </div>

          <div className="space-y-3">
            {overview.recentOrders?.length ? (
              overview.recentOrders.map((order) => (
                <div key={order._id} className="flex flex-col justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:flex-row sm:items-center">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">Order ID: {String(order._id).slice(-6).toUpperCase()}</p>
                    <p className="text-xs text-slate-500">{new Date(order.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-emerald-700">{order.status}</span>
                    <strong className="text-sm font-bold text-slate-900">{formatCurrency(order.sellerRevenue)}</strong>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">
                No sales activity yet. Add products and start selling to see your revenue flow here.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SellerDashboard;
