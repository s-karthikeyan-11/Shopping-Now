import React, { useEffect, useState } from 'react';
import { CheckCircle2, PackageCheck, RefreshCw } from 'lucide-react';
import { Link, useLocation, useParams } from 'react-router-dom';
import api from '../api/axios';

const RETURN_REASONS = ['Damaged or defective', 'Wrong item received', 'Item not as described', 'Changed my mind', 'Other'];

const OrderDetails = () => {
  const { id } = useParams();
  const location = useLocation();
  const [order, setOrder] = useState(null);
  const [error, setError] = useState('');
  const [cancelError, setCancelError] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [returnReason, setReturnReason] = useState('');
  const [returnError, setReturnError] = useState('');
  const [returning, setReturning] = useState(false);
  const [trackingError, setTrackingError] = useState('');
  const [refreshingTracking, setRefreshingTracking] = useState(false);

  useEffect(() => { api.get(`/orders/${id}`).then(({ data }) => setOrder(data)).catch((err) => setError(err.response?.data?.message || 'Could not load this order')); }, [id]);

  if (error) return <div className="section-shell py-16 text-center"><h1 className="text-2xl font-bold">Order unavailable</h1><p className="mt-2 text-slate-600">{error}</p><Link className="btn btn-primary mt-5" to="/orders">View my orders</Link></div>;
  if (!order) return <div className="section-shell py-16"><div className="mx-auto h-64 max-w-2xl animate-pulse rounded-2xl bg-slate-200" /></div>;

  const originalSubtotal = order.items.reduce((sum, item) => sum + Number(item.price || 0) * item.quantity, 0);
  const discount = order.items.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.discountPercent || 0) / 100 * item.quantity, 0);
  const canCancel = order.status === 'Pending';
  const fulfillmentSteps = ['Pending', 'Processing', 'Shipped', 'Delivered'];
  const currentStep = fulfillmentSteps.indexOf(order.status);
  const returnStatus = order.returnRequest?.status || 'Not Requested';
  const deliveredOn = new Date(order.deliveredAt || order.updatedAt).getTime();
  const returnWindowOpen = Date.now() >= deliveredOn && Date.now() - deliveredOn <= 7 * 24 * 60 * 60 * 1000;
  const canRequestReturn = order.status === 'Delivered' && returnStatus === 'Not Requested' && returnWindowOpen;
  const deliveries = order.sellerShipments?.length
    ? order.sellerShipments
    : order.trackingNumber ? [{
      seller: null,
      carrier: order.shippingCarrier,
      trackingNumber: order.trackingNumber,
      shipmentStatus: order.shipmentStatus,
      events: order.shipmentEvents,
      shippedAt: order.shippedAt,
      status: order.status,
      provider: order.shippingProvider,
    }] : [];
  const hasTrackableShipment = deliveries.some((shipment) => shipment.provider && shipment.trackingNumber);

  const cancelOrder = async () => {
    if (!window.confirm('Cancel this order? This cannot be undone.')) return;
    setCancelling(true);
    setCancelError('');
    try {
      const { data } = await api.post(`/orders/${order._id}/cancel`);
      setOrder(data.order);
    } catch (requestError) {
      setCancelError(requestError.response?.data?.message || 'Unable to cancel this order. Please try again.');
    } finally {
      setCancelling(false);
    }
  };

  const requestReturn = async (event) => {
    event.preventDefault();
    setReturning(true);
    setReturnError('');
    try {
      const { data } = await api.post(`/orders/${order._id}/return`, { reason: returnReason });
      setOrder(data);
    } catch (requestError) {
      setReturnError(requestError.response?.data?.message || 'Unable to submit this return request. Please try again.');
    } finally {
      setReturning(false);
    }
  };

  const refreshTracking = async () => {
    setRefreshingTracking(true);
    setTrackingError('');
    try {
      const { data } = await api.get(`/orders/${order._id}/tracking`);
      setOrder((current) => ({
        ...current,
        status: data.status,
        sellerShipments: data.shipments?.length ? data.shipments : current.sellerShipments,
        ...(data.shipment ? { shipmentStatus: data.shipment.status, shipmentEvents: data.shipment.events } : {}),
        ...(data.reversePickup ? {
          returnRequest: {
            ...current.returnRequest,
            pickupTrackingStatus: data.reversePickup.status,
            pickupEvents: data.reversePickup.events,
          },
        } : {}),
      }));
    } catch (requestError) {
      setTrackingError(requestError.response?.data?.message || 'Could not refresh shipment tracking.');
    } finally {
      setRefreshingTracking(false);
    }
  };

  return <div className="section-shell py-8 sm:py-12">
    {location.state?.success && <div className="mx-auto mb-8 max-w-3xl rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center"><CheckCircle2 size={34} className="mx-auto text-emerald-700" /><p className="mt-3 text-xs font-bold uppercase tracking-[0.16em] text-emerald-800">Order confirmed</p><h1 className="mt-2 text-2xl font-bold">Thank you for your order</h1><p className="mt-2 text-sm text-slate-600">Your order ID is <strong>#{order._id.toUpperCase()}</strong></p><div className="mt-5 flex flex-wrap justify-center gap-3"><Link className="btn btn-primary" to="/orders">Track order</Link><Link className="btn btn-secondary" to="/products">Continue shopping</Link></div></div>}
    <div className="mx-auto max-w-3xl"><div className="mb-6 flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-800">Order details</p><h1 className="mt-2 text-3xl font-bold">#{order._id.toUpperCase()}</h1></div><div className="flex flex-wrap items-center gap-3"><span className="w-fit rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">{order.status}</span>{canCancel && <button type="button" className="btn border border-rose-200 bg-rose-50 px-3 py-2 text-rose-700 hover:bg-rose-100" onClick={cancelOrder} disabled={cancelling}>{cancelling ? 'Cancelling…' : 'Cancel order'}</button>}</div></div>
      {cancelError && <div role="alert" className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{cancelError}</div>}
      <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7" aria-label="Delivery progress">
        <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-bold">Delivery progress</h2>{hasTrackableShipment && <button type="button" onClick={refreshTracking} disabled={refreshingTracking} className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-800 disabled:opacity-50"><RefreshCw size={15} className={refreshingTracking ? 'animate-spin' : ''} />{refreshingTracking ? 'Refreshing…' : 'Refresh tracking'}</button>}</div>
        {trackingError && <p role="alert" className="mt-2 text-sm text-rose-700">{trackingError}</p>}
        {order.status === 'Cancelled' ? (
          <p className="mt-3 text-sm font-semibold text-rose-700">This order was cancelled.</p>
        ) : (
          <ol className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {fulfillmentSteps.map((step, index) => (
              <li key={step} className={`border-t-2 pt-3 text-sm ${index <= currentStep ? 'border-emerald-600 text-emerald-800' : 'border-slate-200 text-slate-400'}`}>
                <span className="font-semibold">{step}</span>
                {step === 'Shipped' && order.shippedAt && <time className="mt-1 block text-xs text-slate-500">{new Date(order.shippedAt).toLocaleDateString()}</time>}
                {step === 'Delivered' && order.deliveredAt && <time className="mt-1 block text-xs text-slate-500">{new Date(order.deliveredAt).toLocaleDateString()}</time>}
              </li>
            ))}
          </ol>
        )}
        {deliveries.map((shipment, index) => <div key={shipment._id || shipment.trackingNumber || index} className="mt-5 border-t border-slate-100 pt-4 text-sm"><p className="font-semibold text-slate-800">{deliveries.length > 1 ? `Shipment ${index + 1}` : 'Shipment details'}{shipment.seller?.name ? ` · ${shipment.seller.name}` : ''}</p><p className="mt-1 text-slate-600">{shipment.carrier || shipment.provider} · Tracking number: <span className="font-mono font-semibold text-slate-900">{shipment.trackingNumber}</span>{shipment.shipmentStatus ? ` · ${shipment.shipmentStatus}` : ''}</p>{shipment.events?.length > 0 && <ol className="mt-3 space-y-1 border-l border-slate-200 pl-3">{shipment.events.map((event, eventIndex) => <li key={`${event.status}-${eventIndex}`} className="text-xs text-slate-500">{event.status} · {new Date(event.createdAt).toLocaleString()}{event.location ? ` · ${event.location}` : ''}{event.description ? ` · ${event.description}` : ''}</li>)}</ol>}</div>)}
      </section>
      <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <h2 className="text-lg font-bold">Returns and refunds</h2>
        {canRequestReturn ? (
          <form className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={requestReturn}>
            <label className="flex-1 text-sm font-semibold text-slate-700">
              Reason for return
              <select className="input mt-1 w-full" value={returnReason} onChange={(event) => setReturnReason(event.target.value)} required>
                <option value="" disabled>Select a reason</option>
                {RETURN_REASONS.map((reason) => <option key={reason} value={reason}>{reason}</option>)}
              </select>
            </label>
            <button type="submit" className="btn btn-primary" disabled={returning || !returnReason}>
              {returning ? 'Submitting…' : 'Request a return'}
            </button>
          </form>
        ) : returnStatus !== 'Not Requested' ? (
          <div className="mt-3 text-sm text-slate-600">
            <p>Return status: <span className="font-semibold text-slate-900">{returnStatus}</span></p>
            {order.returnRequest?.reason && <p className="mt-1">Reason: {order.returnRequest.reason}</p>}
            {order.returnRequest?.pickupStatus && order.returnRequest.pickupStatus !== 'Not scheduled' && <p className="mt-1">Return pickup: <span className="font-semibold text-slate-900">{order.returnRequest.pickupStatus}</span></p>}
            {order.returnRequest?.pickupTrackingNumber && <p className="mt-1">Pickup tracking: {order.returnRequest.pickupCarrier} · <span className="font-mono">{order.returnRequest.pickupTrackingNumber}</span></p>}
            {order.returnRequest?.pickupTrackingStatus && <p className="mt-1">Carrier status: <span className="font-semibold text-slate-900">{order.returnRequest.pickupTrackingStatus}</span></p>}
            {order.returnRequest?.pickupEvents?.map((event, index) => <p key={`${event.status}-${index}`} className="mt-1 text-xs text-slate-500">{event.status} · {new Date(event.createdAt).toLocaleString()}{event.location ? ` · ${event.location}` : ''}</p>)}
            {order.returnRequest?.inspectionStatus && order.returnRequest.inspectionStatus !== 'Not started' && <p className="mt-1">Inspection: <span className="font-semibold text-slate-900">{order.returnRequest.inspectionStatus}</span></p>}
            {order.returnRequest?.events?.length > 0 && <ol className="mt-3 space-y-1 border-l border-slate-200 pl-3">{order.returnRequest.events.map((event, index) => <li key={`${event.status}-${index}`} className="text-xs text-slate-500">{event.status} · {new Date(event.createdAt).toLocaleString()}{event.note ? ` · ${event.note}` : ''}</li>)}</ol>}
            {order.refundStatus && order.refundStatus !== 'Not Required' && <p className="mt-1">Refund status: <span className="font-semibold text-slate-900">{order.refundStatus}</span></p>}
            {order.returnRequest?.refundReference && <p className="mt-1">Refund reference: <span className="font-mono">{order.returnRequest.refundReference}</span></p>}
          </div>
        ) : order.status === 'Delivered' ? (
          <p className="mt-3 text-sm text-slate-600">The seven-day return window has closed.</p>
        ) : (
          <p className="mt-3 text-sm text-slate-600">A return request can be submitted within seven days after delivery.</p>
        )}
        {returnError && <p role="alert" className="mt-3 text-sm text-rose-700">{returnError}</p>}
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7"><div className="flex items-center gap-3"><PackageCheck size={20} className="text-emerald-800" /><h2 className="text-lg font-bold">Items in this order</h2></div><div className="mt-5 divide-y divide-slate-100">{order.items.map((item, index) => <div key={`${item.product}-${index}`} className="flex items-center justify-between gap-4 py-4"><div className="min-w-0"><p className="font-semibold">{item.name}</p><p className="mt-1 text-sm text-slate-500">Quantity {item.quantity}</p></div><span className="shrink-0 font-semibold">₹{Number(item.lineTotal || 0).toFixed(2)}</span></div>)}</div>
        <div className="mt-4 grid gap-6 border-t border-slate-200 pt-5 sm:grid-cols-2"><div><h3 className="text-sm font-semibold">Delivery address</h3><p className="mt-2 text-sm leading-6 text-slate-600">{order.shippingAddress?.line1}<br />{order.shippingAddress?.city}, {order.shippingAddress?.state} {order.shippingAddress?.pincode}<br />{order.shippingAddress?.phone}</p></div><div><h3 className="text-sm font-semibold">Payment method</h3><p className="mt-2 text-sm text-slate-600">{order.paymentMethod || 'Cash on Delivery'}</p></div></div>
        <div className="mt-6 space-y-3 border-t border-slate-200 pt-4 text-sm"><div className="flex justify-between text-slate-600"><span>Subtotal</span><span>₹{originalSubtotal.toFixed(2)}</span></div><div className="flex justify-between text-emerald-800"><span>Discount</span><span>−₹{discount.toFixed(2)}</span></div>{Number(order.couponDiscount || 0) > 0 && <div className="flex justify-between text-emerald-800"><span>Promotion{order.couponCode ? ` (${order.couponCode})` : ''}</span><span>−₹{Number(order.couponDiscount).toFixed(2)}</span></div>}<div className="flex justify-between text-slate-600"><span>Tax</span><span>₹{Number(order.totalGst || 0).toFixed(2)}</span></div><div className="flex justify-between text-slate-600"><span>Delivery fee</span><span>{Number(order.deliveryFee || 0) === 0 ? 'Free' : `₹${Number(order.deliveryFee).toFixed(2)}`}</span></div><div className="flex justify-between border-t border-slate-200 pt-3 text-lg font-bold"><span>Total</span><span>₹{Number(order.totalAmount).toFixed(2)}</span></div></div>
      </section></div>
  </div>;
};

export default OrderDetails;
