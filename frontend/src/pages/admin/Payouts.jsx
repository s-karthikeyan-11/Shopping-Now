import React, { useEffect, useState } from 'react';
import api from '../../api/axios';

const currency = (value) => `₹${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const AdminPayouts = () => {
  const [data, setData] = useState({ summary: {}, settlements: [], codOrders: [], payoutProviderConfigured: false });
  const [error, setError] = useState('');

  const load = () => api.get('/admin/payouts').then(({ data: response }) => setData(response));

  useEffect(() => {
    load().catch(() => setError('Could not load seller settlements.'));
  }, []);

  const recordReference = async (message) => {
    const reference = window.prompt(message)?.trim();
    return reference || '';
  };

  const confirmCashCollection = async (orderId) => {
    const reference = await recordReference('Enter the COD collection receipt or reconciliation reference:');
    if (!reference) return;
    try {
      await api.patch(`/admin/orders/${orderId}/collection`, { reference });
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Could not record COD collection.');
    }
  };

  const paySettlement = async (settlementId, recovery = false) => {
    const manual = recovery || !data.payoutProviderConfigured;
    const reference = manual
      ? await recordReference(recovery ? 'Enter the seller recovery reference:' : 'Enter the bank transfer or payout reference:')
      : '';
    if (manual && !reference) return;
    try {
      await api.patch(`/admin/payouts/${settlementId}/${recovery ? 'recovered' : 'paid'}`, reference ? { reference } : {});
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Could not record seller payout.');
    }
  };

  const refreshProviderPayout = async (settlement) => {
    try {
      if (settlement.razorpayPayoutId) await api.get(`/admin/payouts/${settlement._id}/provider-status`);
      else await api.patch(`/admin/payouts/${settlement._id}/paid`, {});
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Could not refresh payout status.');
    }
  };

  return (
    <div>
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Finance</p>
        <h2 className="mt-2 text-2xl font-bold text-slate-900 sm:text-[28px]">Seller payouts</h2>
          <p className="mt-1 text-sm text-slate-500">{data.payoutProviderConfigured ? 'RazorpayX payouts enabled' : 'Manual payout reconciliation'}</p>
      </div>
      {error && <div role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}

      <div className="mb-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {[
          ['Ready to pay', data.summary.pendingAmount],
          ['Processing', data.summary.processingAmount],
          ['Failed', data.summary.failedAmount],
          ['Compliance hold', data.summary.onHoldAmount],
          ['Paid out', data.summary.paidAmount],
          ['Recovery due', data.summary.recoveryDue],
        ].map(([label, amount]) => <div key={label} className="admin-card p-4"><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-xl font-bold text-slate-900">{currency(amount)}</p></div>)}
      </div>

      <section className="mb-8">
        <h3 className="mb-3 text-lg font-semibold text-slate-900">COD collection reconciliation</h3>
        <div className="overflow-x-auto rounded-2xl border border-slate-200">
          <table className="w-full min-w-[680px] border-collapse bg-white">
            <thead><tr><th className="table-th">Order</th><th className="table-th">Customer</th><th className="table-th">Amount</th><th className="table-th">Delivered</th><th className="table-th"></th></tr></thead>
            <tbody>
              {data.codOrders.map((order) => <tr key={order._id}>
                <td className="table-td font-semibold">#{order._id.slice(-6).toUpperCase()}</td>
                <td className="table-td">{order.user?.name || 'Customer'}</td>
                <td className="table-td">{currency(order.totalAmount)}</td>
                <td className="table-td">{order.deliveredAt ? new Date(order.deliveredAt).toLocaleDateString() : 'Delivered'}</td>
                <td className="table-td"><button className="link-btn" type="button" onClick={() => confirmCashCollection(order._id)}>Record collected</button></td>
              </tr>)}
              {!data.codOrders.length && <tr><td className="table-td py-6 text-center text-slate-500" colSpan="5">No delivered COD orders need reconciliation.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-lg font-semibold text-slate-900">Settlement ledger</h3>
        <div className="overflow-x-auto rounded-2xl border border-slate-200">
          <table className="w-full min-w-[900px] border-collapse bg-white">
            <thead><tr><th className="table-th">Seller</th><th className="table-th">Order</th><th className="table-th">Gross</th><th className="table-th">Commission</th><th className="table-th">Net payable</th><th className="table-th">Status</th><th className="table-th">Reference</th><th className="table-th"></th></tr></thead>
            <tbody>
              {data.settlements.map((settlement) => <tr key={settlement._id}>
                <td className="table-td">{settlement.seller?.businessName || settlement.seller?.user?.name || 'Seller'}</td>
                <td className="table-td">#{settlement.order?._id?.slice(-6).toUpperCase() || 'N/A'}</td>
                <td className="table-td">{currency(settlement.grossAmount)}</td>
                <td className="table-td">{currency(settlement.commissionAmount)} ({settlement.commissionRate}%)</td>
                <td className="table-td font-semibold">{currency(settlement.netAmount)}</td>
                <td className="table-td">{settlement.status}</td>
                <td className="table-td font-mono text-xs">{settlement.payoutReference || settlement.recoveryReference || '—'}</td>
                <td className="table-td">
                  {settlement.status === 'Pending' && <button className="link-btn" type="button" onClick={() => paySettlement(settlement._id)}>{data.payoutProviderConfigured ? 'Send payout' : 'Record transfer'}</button>}
                  {data.payoutProviderConfigured && settlement.status === 'Failed' && <button className="link-btn" type="button" onClick={() => paySettlement(settlement._id)}>Retry payout</button>}
                  {data.payoutProviderConfigured && settlement.status === 'Processing' && <button className="link-btn" type="button" onClick={() => refreshProviderPayout(settlement)}>{settlement.razorpayPayoutId ? 'Refresh status' : 'Retry safely'}</button>}
                  {settlement.status === 'Recovery Due' && <button className="link-btn text-rose-700" type="button" onClick={() => paySettlement(settlement._id, true)}>Record recovery</button>}
                  {settlement.payoutError && <p className="mt-1 max-w-48 text-xs text-rose-700">{settlement.payoutError}</p>}
                </td>
              </tr>)}
              {!data.settlements.length && <tr><td className="table-td py-6 text-center text-slate-500" colSpan="8">No seller settlements yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

export default AdminPayouts;