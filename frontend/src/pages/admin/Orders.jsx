import React, { useEffect, useState } from 'react';
import api from '../../api/axios';

const STATUSES = ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled'];
const STATUS_STYLES = {
  Pending: 'bg-amber-100 text-amber-700',
  Processing: 'bg-sky-100 text-sky-700',
  Shipped: 'bg-violet-100 text-violet-700',
  Delivered: 'bg-emerald-100 text-emerald-700',
  Cancelled: 'bg-rose-100 text-rose-700',
};
const STATUS_TRANSITIONS = {
  Pending: ['Processing', 'Cancelled'],
  Processing: ['Shipped', 'Cancelled'],
  Shipped: ['Delivered', 'Cancelled'],
  Delivered: [],
  Cancelled: [],
};

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
    try {
      await api.put(`/admin/orders/${id}/status`, { status });
      load(filter);
    } catch (err) {
      window.alert(err.response?.data?.message || 'Could not update order status');
    }
  };

  const handleReturnDecision = async (id, decision) => {
    const refundReference = decision === 'mark-refunded'
      ? window.prompt('Enter the offline refund reference:')?.trim()
      : undefined;
    if (decision === 'mark-refunded' && !refundReference) return;

    try {
      await api.patch(`/admin/orders/${id}/return`, { decision, refundReference });
      load(filter);
    } catch (err) {
      window.alert(err.response?.data?.message || 'Could not update this return request');
    }
  };

  const handleReturnLogistics = async (order, updates) => {
    try {
      await api.patch(`/admin/orders/${order._id}/return/logistics`, updates);
      load(filter);
    } catch (err) {
      window.alert(err.response?.data?.message || 'Could not update return logistics');
    }
  };

  const cancelReturnPickup = async (orderId) => {
    if (!window.confirm('Cancel this reverse pickup?')) return;
    try {
      await api.post(`/admin/orders/${orderId}/return/pickup/cancel`);
      await load(filter);
    } catch (err) {
      window.alert(err.response?.data?.message || 'Could not cancel the reverse pickup');
    }
  };

  const reconcileCarrierRequest = async (orderId, reverse = false, sellerId) => {
    const trackingNumber = window.prompt('Enter the tracking number confirmed in the carrier dashboard:')?.trim();
    if (!trackingNumber) return;
    const providerShipmentId = window.prompt('Enter the provider shipment reference, if available:')?.trim() || '';
    try {
      const path = reverse
        ? `/admin/orders/${orderId}/return/pickup/reconcile`
        : `/admin/orders/${orderId}/shipment/reconcile`;
      await api.patch(path, { trackingNumber, providerShipmentId, sellerId });
      await load(filter);
    } catch (err) {
      window.alert(err.response?.data?.message || 'Could not reconcile the carrier shipment');
    }
  };

  const cancelSellerShipment = async (orderId, sellerId) => {
    if (!window.confirm('Cancel this seller shipment with the carrier?')) return;
    try {
      await api.post(`/admin/orders/${orderId}/shipment/cancel`, { sellerId });
      await load(filter);
    } catch (err) {
      window.alert(err.response?.data?.message || 'Could not cancel the seller shipment');
    }
  };

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Operations</p>
          <h2 className="mt-2 text-2xl font-bold text-slate-900 sm:text-[28px]">Orders</h2>
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-600">
          <span className="whitespace-nowrap">Filter by status:</span>
          <select className="input w-auto min-w-[180px]" value={filter} onChange={handleFilter}>
            <option value="">All</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
      </div>

      <div className="overflow-x-auto rounded-[24px] border border-slate-200">
        <table className="w-full min-w-[1280px] border-collapse bg-white">
          <thead>
            <tr>
              <th className="table-th">Order</th><th className="table-th">Customer</th><th className="table-th">Items</th>
              <th className="table-th">Total</th><th className="table-th">Status</th><th className="table-th">Shipments</th><th className="table-th">Return</th><th className="table-th">Placed</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o._id}>
                <td className="table-td font-semibold text-slate-800">#{o._id.slice(-6).toUpperCase()}</td>
                <td className="table-td">
                  <div className="font-medium text-slate-800">{o.user?.name}</div>
                  <div className="text-xs text-slate-500">{o.user?.email}</div>
                </td>
                <td className="table-td max-w-[220px] text-slate-700">{o.items.map((it) => `${it.name} x${it.quantity}`).join(', ')}</td>
                <td className="table-td font-semibold text-slate-800">₹{Number(o.totalAmount || 0).toFixed(2)}</td>
                <td className="table-td">
                  <select
                    className={`input min-w-[150px] ${STATUS_STYLES[o.status] || 'bg-slate-100 text-slate-700'}`}
                    value={o.status}
                    onChange={(e) => handleStatusChange(o._id, e.target.value)}
                  >
                    {[o.status, ...(STATUS_TRANSITIONS[o.status] || [])].map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                  {(o.sellerShipments || []).filter((shipment) => ['Creating', 'Creation uncertain'].includes(shipment.shipmentStatus)).map((shipment) => <div key={shipment._id} className="mt-2 text-xs text-amber-700"><span>{shipment.seller?.name || 'Seller'} shipment needs reconciliation</span><button type="button" className="ml-2 font-semibold underline" onClick={() => reconcileCarrierRequest(o._id, false, String(shipment.seller?._id || shipment.seller))}>Reconcile</button></div>)}
                  {(o.sellerShipments || []).filter((shipment) => ['Creating', 'Creation uncertain'].includes(shipment.shipmentStatus)).map((shipment) => <button key={shipment._id} type="button" className="mt-2 block text-xs font-semibold text-amber-700" onClick={() => reconcileCarrierRequest(o._id, false, String(shipment.seller?._id || shipment.seller))}>Reconcile {shipment.seller?.name || 'seller'} shipment</button>)}
                </td>
                <td className="table-td">
                  {(o.sellerShipments || []).map((shipment) => (
                    <div key={shipment._id} className="mb-2 min-w-[190px] border-b border-slate-100 pb-2 last:mb-0 last:border-0 last:pb-0">
                      <p className="font-semibold text-slate-800">{shipment.seller?.name || 'Seller'} · {shipment.status}</p>
                      {shipment.trackingNumber && <p className="mt-1 font-mono text-xs text-slate-600">{shipment.carrier} · {shipment.trackingNumber}</p>}
                      {shipment.shipmentStatus && <p className="text-xs text-slate-500">{shipment.shipmentStatus}</p>}
                      {shipment.status === 'Shipped' && <button type="button" className="mt-1 text-xs font-semibold text-rose-700" onClick={() => cancelSellerShipment(o._id, String(shipment.seller?._id || shipment.seller))}>Cancel shipment</button>}
                    </div>
                  ))}
                  {!o.sellerShipments?.length && o.trackingNumber && <div className="font-mono text-xs text-slate-600">{o.shippingCarrier} · {o.trackingNumber}</div>}
                </td>
                <td className="table-td">
                  <div className="font-medium text-slate-800">{o.returnRequest?.status || 'Not Requested'}</div>
                  {o.returnRequest?.reason && <div className="mt-1 max-w-[180px] text-xs text-slate-500">{o.returnRequest.reason}</div>}
                  {o.returnRequest?.status === 'Requested' && (
                    <div className="mt-2 flex gap-2">
                      <button type="button" className="text-xs font-semibold text-emerald-700 hover:text-emerald-900" onClick={() => handleReturnDecision(o._id, 'approve')}>Approve</button>
                      <button type="button" className="text-xs font-semibold text-rose-700 hover:text-rose-900" onClick={() => handleReturnDecision(o._id, 'reject')}>Reject</button>
                    </div>
                  )}
                  {o.returnRequest?.status === 'Approved' && o.paymentMethod !== 'Razorpay' && (
                    o.returnRequest?.inspectionStatus === 'Accepted' && (o.paymentStatus === 'Paid'
                      ? <button type="button" className="mt-2 text-xs font-semibold text-blue-700 hover:text-blue-900" onClick={() => handleReturnDecision(o._id, 'mark-refunded')}>Mark refunded</button>
                      : <p className="mt-2 text-xs text-amber-700">Confirm COD collection before refund.</p>)
                  )}
                  {o.returnRequest?.status === 'Approved' && (
                    <div className="mt-2 space-y-1">
                      <div className="text-xs text-slate-500">Pickup: {o.returnRequest.pickupStatus || 'Not scheduled'} · Inspection: {o.returnRequest.inspectionStatus || 'Not started'}</div>
                      {o.returnRequest.pickupStatus === 'Not scheduled' && <button type="button" className="text-xs font-semibold text-blue-700 hover:text-blue-900" onClick={() => handleReturnLogistics(o, { pickupStatus: 'Scheduled' })}>Schedule pickup</button>}
                      {['Creating', 'Creation uncertain'].includes(o.returnRequest.pickupStatus) && <p className="text-xs text-amber-700">Carrier response needs reconciliation before retrying.</p>}
                      {['Creating', 'Creation uncertain'].includes(o.returnRequest.pickupStatus) && <button type="button" className="text-xs font-semibold text-blue-700" onClick={() => reconcileCarrierRequest(o._id, true)}>Reconcile pickup</button>}
                      {o.returnRequest.pickupStatus === 'Scheduled' && <button type="button" className="text-xs font-semibold text-blue-700 hover:text-blue-900" onClick={() => handleReturnLogistics(o, { pickupStatus: 'Picked up' })}>Mark picked up</button>}
                      {o.returnRequest.pickupStatus === 'Scheduled' && <button type="button" className="text-xs font-semibold text-rose-700 hover:text-rose-900" onClick={() => cancelReturnPickup(o._id)}>Cancel pickup</button>}
                      {o.returnRequest.pickupStatus === 'Picked up' && <button type="button" className="text-xs font-semibold text-blue-700 hover:text-blue-900" onClick={() => handleReturnLogistics(o, { pickupStatus: 'Received' })}>Mark received</button>}
                      {o.returnRequest.pickupStatus === 'Received' && o.returnRequest.inspectionStatus === 'Pending' && <div className="flex gap-2"><button type="button" className="text-xs font-semibold text-emerald-700 hover:text-emerald-900" onClick={() => handleReturnLogistics(o, { inspectionStatus: 'Accepted' })}>Accept inspection</button><button type="button" className="text-xs font-semibold text-rose-700 hover:text-rose-900" onClick={() => handleReturnLogistics(o, { inspectionStatus: 'Rejected' })}>Reject inspection</button></div>}
                      {o.returnRequest.pickupCarrier && <div className="max-w-[180px] text-xs text-slate-500">{o.returnRequest.pickupCarrier}: {o.returnRequest.pickupTrackingNumber}</div>}
                      {o.returnRequest.events?.map((event, index) => <div key={`${event.status}-${index}`} className="text-[11px] text-slate-400">{event.status} · {new Date(event.createdAt).toLocaleDateString()}</div>)}
                    </div>
                  )}
                  {o.returnRequest?.status === 'Approved' && o.paymentMethod === 'Razorpay' && o.returnRequest?.inspectionStatus === 'Accepted' && (
                    <button type="button" className="mt-2 text-xs font-semibold text-blue-700 hover:text-blue-900" onClick={() => handleReturnDecision(o._id, 'retry-refund')}>Retry refund</button>
                  )}
                </td>
                <td className="table-td text-slate-600">{new Date(o.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AdminOrders;
