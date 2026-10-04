import React, { useEffect, useState } from 'react';
import api from '../api/axios';

const statusClasses = {
  Pending: 'bg-amber-100 text-amber-800',
  Processing: 'bg-blue-100 text-blue-800',
  Shipped: 'bg-violet-100 text-violet-800',
  Delivered: 'bg-emerald-100 text-emerald-800',
  Cancelled: 'bg-rose-100 text-rose-800',
};

const SellerOrders = () => {
  const [orders, setOrders] = useState([]);
  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [shipmentBusy, setShipmentBusy] = useState('');
  const [packageBusy, setPackageBusy] = useState('');
  const [qrCode, setQrCode] = useState(null);

  const loadOrders = async () => {
    setLoading(true);
    setError('');

    try {
      const [{ data: orderData }, { data: packageData }] = await Promise.all([
        api.get('/orders/seller'),
        api.get('/packages/mine'),
      ]);
      setOrders(orderData);
      setPackages(packageData);
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to load orders right now.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
  }, []);

  const updateStatus = async (orderId, nextStatus) => {
    try {
      await api.patch(`/orders/seller/${orderId}/status`, { status: nextStatus });
      await loadOrders();
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to update this order status.');
    }
  };

  const createShipment = async (orderId) => {
    setShipmentBusy(orderId);
    setError('');
    try {
      await api.post(`/orders/seller/${orderId}/shipment`);
      await loadOrders();
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to create the shipment.');
    } finally {
      setShipmentBusy('');
    }
  };

  const cancelShipment = async (orderId) => {
    if (!window.confirm('Cancel this carrier shipment? The order will return to processing.')) return;
    setShipmentBusy(orderId);
    setError('');
    try {
      await api.post(`/orders/seller/${orderId}/shipment/cancel`);
      await loadOrders();
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to cancel the carrier shipment.');
    } finally {
      setShipmentBusy('');
    }
  };

  const refreshShipment = async (orderId) => {
    setShipmentBusy(orderId);
    setError('');
    try {
      await api.get(`/orders/${orderId}/tracking`);
      await loadOrders();
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to refresh shipment tracking.');
    } finally {
      setShipmentBusy('');
    }
  };

  const createPackage = async (orderId) => {
    setPackageBusy(orderId);
    setError('');
    try {
      const { data } = await api.post('/packages', { orderId });
      setQrCode({ packageId: data.package.packageId, dataUrl: data.qrCodeDataUrl });
      await loadOrders();
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to create a verified package.');
    } finally {
      setPackageBusy('');
    }
  };

  const uploadPackingEvidence = async (pkg, file) => {
    if (!file) return;
    setPackageBusy(String(pkg._id));
    setError('');
    try {
      await api.post('/evidence/upload', file, {
        headers: {
          'Content-Type': file.type,
          'X-Evidence-Type': 'packing',
          'X-Package-Id': pkg._id,
          'X-File-Name': encodeURIComponent(file.name),
        },
      });
      await loadOrders();
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to upload packing evidence.');
    } finally {
      setPackageBusy('');
    }
  };

  const markPackageReady = async (pkg) => {
    setPackageBusy(String(pkg._id));
    setError('');
    try {
      await api.post(`/packages/${pkg._id}/ready`);
      await loadOrders();
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to mark package ready.');
    } finally {
      setPackageBusy('');
    }
  };

  const showQrCode = async (pkg) => {
    setPackageBusy(String(pkg._id));
    try {
      const { data } = await api.get(`/packages/${pkg._id}/qr`);
      setQrCode({ packageId: data.package.packageId, dataUrl: data.qrCodeDataUrl });
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to load package QR code.');
    } finally {
      setPackageBusy('');
    }
  };

  if (loading) {
    return <div className="p-8 text-slate-500">Loading seller orders...</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Seller portal</p>
            <h1 className="mt-2 text-3xl font-bold text-slate-900">Orders</h1>
          </div>
        </div>

        {error && (
          <div className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
            {error}
          </div>
        )}

        {!error && orders.length === 0 && (
          <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-10 text-center text-slate-600">
            No orders for your products yet.
          </div>
        )}

        <div className="space-y-4">
          {orders.map((order) => {
            const fulfillment = order.sellerFulfillment;
            const fulfillmentStatus = fulfillment?.status || order.status;
            const pkg = packages.find((item) => String(item.order?._id || item.order) === String(order._id));
            return (
            <div key={order._id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Order #{String(order._id).slice(-6).toUpperCase()}</p>
                  <h2 className="mt-1 text-xl font-bold text-slate-900">{order.user?.name || 'Customer'}</h2>
                </div>
                <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${statusClasses[fulfillmentStatus] || 'bg-slate-100 text-slate-700'}`}>
                  {fulfillmentStatus}
                </span>
              </div>

              <div className="mt-4 flex flex-col gap-2 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
                <span>{new Date(order.createdAt).toLocaleString('en-IN')}</span>
                <span className="font-semibold text-slate-800">Seller revenue: ₹{Number(order.sellerRevenue || 0).toFixed(2)}</span>
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-2">
                {order.sellerItems?.map((item) => (
                  <div key={item.product} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold text-slate-800">{item.name}</p>
                      <span className="text-sm text-slate-600">Qty {item.quantity}</span>
                    </div>
                    <p className="mt-2 text-sm text-slate-600">₹{Number(item.lineTotal || 0).toFixed(2)}</p>
                  </div>
                ))}
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                {fulfillmentStatus === 'Pending' && (
                  <button type="button" onClick={() => updateStatus(order._id, 'Processing')} className="rounded-xl bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500">
                    Mark Processing
                  </button>
                )}
                {fulfillmentStatus === 'Processing' && (
                  !pkg ? (
                    <button type="button" onClick={() => createPackage(order._id)} disabled={packageBusy === order._id} className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50">
                      {packageBusy === order._id ? 'Creating package…' : 'Create verified package'}
                    </button>
                  ) : pkg.status !== 'Ready for Dispatch' && pkg.status !== 'Assigned' ? (
                    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-2 text-sm text-amber-900">
                      <span className="font-semibold">{pkg.packageId} · {pkg.status}</span>
                      <button type="button" onClick={() => showQrCode(pkg)} disabled={packageBusy === String(pkg._id)} className="rounded-lg border border-amber-300 bg-white px-2.5 py-1.5 font-medium">View QR</button>
                      <label className="cursor-pointer rounded-lg bg-amber-700 px-2.5 py-1.5 font-medium text-white hover:bg-amber-600">
                        {packageBusy === String(pkg._id) ? 'Uploading…' : 'Upload packing proof'}
                        <input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" onChange={(event) => uploadPackingEvidence(pkg, event.target.files?.[0])} />
                      </label>
                      <button type="button" onClick={() => markPackageReady(pkg)} disabled={packageBusy === String(pkg._id)} className="rounded-lg bg-emerald-700 px-2.5 py-1.5 font-medium text-white hover:bg-emerald-600">Ready for dispatch</button>
                    </div>
                  ) : fulfillment?.shipmentStatus === 'Creation uncertain' ? (
                    <p className="text-sm text-amber-700">Carrier creation needs reconciliation. Check the carrier account before retrying.</p>
                  ) : (
                    <button type="button" onClick={() => createShipment(order._id)} disabled={shipmentBusy === order._id} className="rounded-xl bg-violet-600 px-3 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50">
                      {shipmentBusy === order._id ? 'Creating shipment…' : 'Create carrier shipment'}
                    </button>
                  )
                )}
                {fulfillmentStatus === 'Shipped' && (
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-sm text-slate-600">{fulfillment?.carrier}: <span className="font-mono font-semibold text-slate-900">{fulfillment?.trackingNumber}</span> · {fulfillment?.shipmentStatus}</span>
                    <button type="button" onClick={() => refreshShipment(order._id)} disabled={shipmentBusy === order._id} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">{shipmentBusy === order._id ? 'Refreshing…' : 'Refresh tracking'}</button>
                    <button type="button" onClick={() => cancelShipment(order._id)} disabled={shipmentBusy === order._id} className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-100 disabled:opacity-50">{shipmentBusy === order._id ? 'Cancelling…' : 'Cancel shipment'}</button>
                  </div>
                )}
              </div>
              {fulfillment?.events?.length > 0 && <ol className="mt-4 space-y-1 border-l border-slate-200 pl-3">{fulfillment.events.map((event, index) => <li key={`${event.status}-${index}`} className="text-xs text-slate-500">{event.status}{event.location ? ` · ${event.location}` : ''}</li>)}</ol>}
            </div>
            );
          })}
        </div>
        {qrCode && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4" role="dialog" aria-modal="true" aria-label="Package QR code">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 text-center shadow-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Verified package</p>
            <h2 className="mt-2 text-xl font-bold text-slate-900">{qrCode.packageId}</h2>
            <img className="mx-auto mt-5 h-64 w-64 rounded-xl border border-slate-200" src={qrCode.dataUrl} alt={`QR code for ${qrCode.packageId}`} />
            <p className="mt-4 text-sm text-slate-600">Print or attach this QR code to the sealed package. Only the assigned delivery partner can verify it.</p>
            <button type="button" className="btn btn-primary mt-5" onClick={() => setQrCode(null)}>Close</button>
          </div>
        </div>}
      </div>
    </div>
  );
};

export default SellerOrders;
