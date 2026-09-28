import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Banknote, Check, CreditCard, LockKeyhole, Smartphone, Truck } from 'lucide-react';
import api from '../api/axios';
import { useCart } from '../context/CartContext';

const steps = ['Delivery address', 'Payment method', 'Order review'];
const paymentOptions = [
  { id: 'UPI', label: 'UPI', detail: 'Pay using your UPI app', icon: Smartphone },
  { id: 'Credit/Debit Card', label: 'Credit or debit card', detail: 'Visa, Mastercard and RuPay', icon: CreditCard },
  { id: 'Net Banking', label: 'Net banking', detail: 'Select your bank at payment', icon: LockKeyhole },
  { id: 'Cash on Delivery', label: 'Cash on Delivery', detail: 'Pay when your order is delivered.', icon: Banknote },
];
const emptyAddress = { line1: '', city: '', state: '', pincode: '', phone: '' };

const Checkout = () => {
  const { items, total, refreshCart, clearCartLocal } = useCart();
  const [step, setStep] = useState(0);
  const [address, setAddress] = useState(() => JSON.parse(localStorage.getItem('shopnowAddress') || 'null') || emptyAddress);
  const [paymentMethod, setPaymentMethod] = useState('Cash on Delivery');
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const summary = useMemo(() => {
    const subtotal = items.reduce((sum, item) => sum + Number(item.product.price || 0) * item.quantity, 0);
    const discount = items.reduce((sum, item) => sum + Number(item.product.price || 0) * Number(item.product.discountPercent || 0) / 100 * item.quantity, 0);
    const itemsTotal = Number(total || 0);
    const delivery = itemsTotal >= 2000 ? 0 : 99;
    const tax = Math.max(0, itemsTotal - (subtotal - discount));
    return { subtotal, discount, tax, delivery, total: itemsTotal + delivery };
  }, [items, total]);

  const updateAddress = (event) => setAddress((current) => ({ ...current, [event.target.name]: event.target.value }));

  const continueToPayment = (event) => {
    event.preventDefault();
    setError('');
    if (Object.values(address).some((value) => !String(value).trim())) {
      setError('Complete every delivery address field to continue.');
      return;
    }
    localStorage.setItem('shopnowAddress', JSON.stringify(address));
    setStep(1);
  };

  const placeOrder = async () => {
    setError('');
    setPlacing(true);
    try {
      const { data } = await api.post('/orders', { shippingAddress: address, paymentMethod });
      clearCartLocal();
      await refreshCart();
      navigate(`/order/${data._id}`, { state: { success: true } });
    } catch (err) {
      setError(err.response?.data?.message || 'We could not place your order. Please try again.');
    } finally {
      setPlacing(false);
    }
  };

  if (!items.length) return <div className="section-shell py-16 text-center"><h1 className="text-3xl font-bold">Your bag is empty</h1><p className="mt-2 text-slate-600">Add something you love before checking out.</p><button className="btn btn-primary mt-6" onClick={() => navigate('/products')}>Browse products</button></div>;

  return (
    <div className="section-shell py-8 sm:py-12">
      <button onClick={() => navigate('/cart')} className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900"><ArrowLeft size={16} />Back to bag</button>
      <div className="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-800">Secure checkout</p><h1 className="mt-2 text-3xl font-bold sm:text-4xl">Complete your order</h1></div>
        <ol className="grid grid-cols-3 gap-2 sm:min-w-[420px]">
          {steps.map((label, index) => <li key={label} className={`flex items-center gap-2 text-xs font-semibold sm:text-sm ${step >= index ? 'text-emerald-800' : 'text-slate-400'}`}><span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${step > index ? 'bg-emerald-800 text-white' : step === index ? 'border-2 border-emerald-800 text-emerald-800' : 'border border-slate-300'}`}>{step > index ? <Check size={14} /> : index + 1}</span><span>{label}</span></li>)}
        </ol>
      </div>

      {error && <div role="alert" className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          {step === 0 && <form onSubmit={continueToPayment}>
            <h2 className="text-xl font-bold">Delivery address</h2><p className="mt-1 text-sm text-slate-500">Where should we deliver your order?</p>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-medium text-slate-700 sm:col-span-2">Street address<input className="input mt-2" autoComplete="street-address" name="line1" value={address.line1} onChange={updateAddress} required /></label>
              <label className="text-sm font-medium text-slate-700">City<input className="input mt-2" autoComplete="address-level2" name="city" value={address.city} onChange={updateAddress} required /></label>
              <label className="text-sm font-medium text-slate-700">State<input className="input mt-2" autoComplete="address-level1" name="state" value={address.state} onChange={updateAddress} required /></label>
              <label className="text-sm font-medium text-slate-700">PIN code<input className="input mt-2" autoComplete="postal-code" inputMode="numeric" name="pincode" value={address.pincode} onChange={updateAddress} required /></label>
              <label className="text-sm font-medium text-slate-700">Phone<input className="input mt-2" autoComplete="tel" inputMode="tel" name="phone" value={address.phone} onChange={updateAddress} required /></label>
            </div>
            <button className="btn btn-primary mt-6 w-full sm:w-auto" type="submit">Continue to payment</button>
          </form>}

          {step === 1 && <div>
            <h2 className="text-xl font-bold">Payment method</h2><p className="mt-1 text-sm text-slate-500">Choose how you would like to pay.</p>
            <div className="mt-6 space-y-3">
              {paymentOptions.map(({ id, label, detail, icon: Icon }) => <label key={id} className={`flex cursor-pointer items-center gap-4 rounded-xl border p-4 transition ${paymentMethod === id ? 'border-emerald-800 bg-emerald-50/60 ring-1 ring-emerald-800' : 'border-slate-200 hover:border-slate-300'}`}>
                <input type="radio" name="paymentMethod" value={id} checked={paymentMethod === id} onChange={() => setPaymentMethod(id)} className="h-4 w-4 accent-emerald-800" />
                <Icon size={20} className={paymentMethod === id ? 'text-emerald-800' : 'text-slate-500'} />
                <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-slate-900">{label}</span><span className="mt-1 block text-xs text-slate-500">{detail}</span></span>
              </label>)}
            </div>
            <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">Online payment processing is not configured yet. Cash on Delivery is available now; other selections will be recorded but are not charged.</p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row"><button className="btn btn-secondary" onClick={() => setStep(0)}>Back to address</button><button className="btn btn-primary" onClick={() => setStep(2)}>Review order</button></div>
          </div>}

          {step === 2 && <div>
            <h2 className="text-xl font-bold">Review your order</h2><p className="mt-1 text-sm text-slate-500">Check your delivery details and items before placing.</p>
            <div className="mt-5 rounded-xl border border-slate-200 p-4"><div className="flex items-start justify-between gap-3"><h3 className="font-semibold">Delivering to</h3><button className="text-sm font-semibold text-emerald-800" onClick={() => setStep(0)}>Edit</button></div><p className="mt-2 text-sm leading-6 text-slate-600">{address.line1}<br />{address.city}, {address.state} {address.pincode}<br />{address.phone}</p></div>
            <div className="mt-4 rounded-xl border border-slate-200 p-4"><div className="flex items-center justify-between gap-3"><h3 className="font-semibold">Payment</h3><button className="text-sm font-semibold text-emerald-800" onClick={() => setStep(1)}>Edit</button></div><p className="mt-2 text-sm text-slate-600">{paymentMethod}</p>{paymentMethod === 'Cash on Delivery' && <p className="mt-1 text-sm text-slate-500">Pay when your order is delivered.</p>}</div>
            <div className="mt-5 space-y-3">{items.map(({ product, quantity, lineTotal }) => <div key={product._id} className="flex items-center gap-3"><img src={product.image || product.imageUrl || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=160&q=80'} alt="" className="h-14 w-14 rounded-lg bg-slate-100 object-cover" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{product.name}</p><p className="text-xs text-slate-500">Quantity {quantity}</p></div><span className="text-sm font-semibold">₹{Number(lineTotal).toFixed(2)}</span></div>)}</div>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row"><button className="btn btn-secondary" onClick={() => setStep(1)}>Back to payment</button><button className="btn btn-primary flex-1" onClick={placeOrder} disabled={placing}>{placing ? 'Placing order…' : `Place order · ₹${summary.total.toFixed(2)}`}</button></div>
          </div>}
        </section>

        <aside className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:sticky lg:top-28">
          <h2 className="text-lg font-bold">Order summary</h2><div className="mt-5 space-y-3 text-sm">
            <div className="flex justify-between gap-3 text-slate-600"><span>Subtotal</span><span>₹{summary.subtotal.toFixed(2)}</span></div>
            <div className="flex justify-between gap-3 text-emerald-800"><span>Discount</span><span>−₹{summary.discount.toFixed(2)}</span></div>
            <div className="flex justify-between gap-3 text-slate-600"><span>Tax</span><span>₹{summary.tax.toFixed(2)}</span></div>
            <div className="flex justify-between gap-3 text-slate-600"><span>Delivery fee</span><span>{summary.delivery === 0 ? 'Free' : `₹${summary.delivery.toFixed(2)}`}</span></div>
            <div className="border-t border-slate-200 pt-3"><div className="flex justify-between gap-3 text-base font-bold"><span>Total</span><span>₹{summary.total.toFixed(2)}</span></div><p className="mt-1 text-xs text-slate-500">Including applicable taxes</p></div>
          </div>
          <div className="mt-5 flex items-center gap-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-600"><Truck size={16} className="shrink-0 text-emerald-800" />Free delivery on orders above ₹2,000</div>
        </aside>
      </div>
    </div>
  );
};

export default Checkout;