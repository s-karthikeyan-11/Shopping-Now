import React, { useEffect, useState } from 'react';
import api from '../api/axios';

const currency = (value) => `₹${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const SellerPayouts = () => {
  const [data, setData] = useState({ summary: {}, settlements: [] });
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/sellers/payouts')
      .then(({ data: response }) => setData(response))
      .catch((requestError) => setError(requestError.response?.data?.message || 'Could not load seller payouts.'));
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Seller portal</p>
          <h1 className="mt-2 text-3xl font-bold text-slate-900">Payouts</h1>
        </div>
        {error && <div role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
        <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[
            ['Ready to pay', data.summary.pendingAmount],
            ['Processing', data.summary.processingAmount],
            ['Failed', data.summary.failedAmount],
            ['On compliance hold', data.summary.onHoldAmount],
            ['Paid', data.summary.paidAmount],
            ['Recovery due', data.summary.recoveryDue],
          ].map(([label, amount]) => <div key={label} className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-xl font-bold text-slate-900">{currency(amount)}</p></div>)}
        </div>
        <div className="overflow-x-auto rounded-2xl border border-slate-200">
          <table className="w-full min-w-[720px] border-collapse bg-white">
            <thead><tr><th className="table-th">Order</th><th className="table-th">Order date</th><th className="table-th">Gross</th><th className="table-th">Commission</th><th className="table-th">Net</th><th className="table-th">Status</th><th className="table-th">Payout reference</th></tr></thead>
            <tbody>
              {data.settlements.map((settlement) => <tr key={settlement._id}>
                <td className="table-td font-semibold">#{settlement.order?._id?.slice(-6).toUpperCase() || 'N/A'}</td>
                <td className="table-td">{settlement.order?.createdAt ? new Date(settlement.order.createdAt).toLocaleDateString() : '—'}</td>
                <td className="table-td">{currency(settlement.grossAmount)}</td>
                <td className="table-td">{currency(settlement.commissionAmount)} ({settlement.commissionRate}%)</td>
                <td className="table-td font-semibold">{currency(settlement.netAmount)}</td>
                <td className="table-td">{settlement.status}</td>
                <td className="table-td font-mono text-xs">{settlement.payoutReference || '—'}</td>
              </tr>)}
              {!data.settlements.length && <tr><td className="table-td py-8 text-center text-slate-500" colSpan="7">Delivered and paid orders will appear here after reconciliation.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default SellerPayouts;