import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import api from '../api/axios';

const Cart = () => {
  const { items, total, refreshCart, updateQuantity, removeFromCart, clearCartLocal } = useCart();
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState('');
  const [address, setAddress] = useState({ line1: '', city: '', state: '', pincode: '', phone: '' });
  const navigate = useNavigate();

  useEffect(() => {
    refreshCart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const subtotal = useMemo(
    () => items.reduce((sum, item) => sum + Number(item.lineTotal || 0), 0),
    [items]
  );
  const delivery = subtotal > 0 ? (subtotal >= 2000 ? 0 : 99) : 0;

  const handleQuantity = async (productId, quantity) => {
    if (quantity < 1) return;
    try {
      await updateQuantity(productId, quantity);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not update quantity');
    }
  };

  const handlePlaceOrder = async () => {
    setError('');
    setPlacing(true);
    try {
      await api.post('/orders', { shippingAddress: address });
      clearCartLocal();
      navigate('/orders');
    } catch (err) {
      setError(err.response?.data?.message || 'Could not place order');
    } finally {
      setPlacing(false);
    }
  };

  if (items.length === 0) {
    return (
      <div className="section-shell py-12 sm:py-16">
        <div className="mx-auto max-w-3xl rounded-[32px] border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm">
          <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-amber-50 text-3xl">🛒</div>
          <h1 className="text-3xl font-bold text-slate-900">Your cart is empty</h1>
          <p className="mt-3 text-slate-600">Add a few essentials and come back here to complete your order.</p>
          <button type="button" className="btn btn-primary mt-6" onClick={() => navigate('/')}>
            Continue shopping
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="section-shell py-10 sm:py-12">
      <div className="mb-8">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Cart</p>
        <h1 className="mt-2 text-4xl font-bold text-slate-900">Your shopping bag</h1>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1.4fr_0.6fr]">
        <div className="space-y-4">
          {error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
              {error}
            </div>
          )}

          {items.map(({ product, quantity, lineTotal }) => (
            <div key={product._id} className="card overflow-hidden p-3 sm:p-4">
              <div className="flex flex-col gap-4 sm:flex-row">
                <div className="h-28 w-full overflow-hidden rounded-2xl bg-slate-100 sm:w-28">
                  <img
                    src={product.image || product.imageUrl || product.imageURL || 'https://images.unsplash.com/photo-1524758631624-e2822e304c36?auto=format&fit=crop&w=900&q=80'}
                    alt={product.name}
                    className="h-full w-full object-cover"
                  />
                </div>

                <div className="flex flex-1 flex-col justify-between gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{product.category || 'General'}</p>
                      <h3 className="mt-2 text-xl font-semibold text-slate-900">{product.name}</h3>
                    </div>
                    <button className="link-btn text-rose-600" onClick={() => removeFromCart(product._id)}>
                      Remove
                    </button>
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3">
                      <button
                        className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-lg text-slate-700"
                        onClick={() => handleQuantity(product._id, quantity - 1)}
                      >
                        −
                      </button>
                      <span className="min-w-[2rem] text-center text-base font-semibold text-slate-900">{quantity}</span>
                      <button
                        className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-lg text-slate-700"
                        onClick={() => handleQuantity(product._id, quantity + 1)}
                      >
                        +
                      </button>
                    </div>

                    <div className="text-left sm:text-right">
                      <div className="text-sm text-slate-500">₹{Number(product.finalPrice || 0).toFixed(2)} each</div>
                      <div className="text-xl font-bold text-slate-900">₹{Number(lineTotal || 0).toFixed(2)}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <aside className="lg:sticky lg:top-24 h-fit">
          <div className="card p-6">
            <h2 className="text-2xl font-bold text-slate-900">Order summary</h2>

            <div className="mt-6 space-y-3 text-sm text-slate-600">
              <div className="flex items-center justify-between">
                <span>Subtotal</span>
                <span className="font-medium text-slate-700">₹{Number(subtotal || 0).toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Discount</span>
                <span className="font-medium text-emerald-600">-₹{(Number(total || subtotal) - Number(subtotal || 0)).toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Delivery</span>
                <span className="font-medium text-slate-700">₹{delivery.toFixed(2)}</span>
              </div>
            </div>

            <div className="my-4 h-px bg-slate-200" />

            <div className="flex items-center justify-between text-lg font-bold text-slate-900">
              <span>Total</span>
              <span>₹{(Number(total || subtotal) + delivery).toFixed(2)}</span>
            </div>

            <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <h3 className="text-lg font-semibold text-slate-900">Shipping address</h3>
              <div className="mt-4 grid grid-cols-1 gap-3">
                <input className="input" placeholder="Address line" value={address.line1} onChange={(e) => setAddress({ ...address, line1: e.target.value })} />
                <input className="input" placeholder="City" value={address.city} onChange={(e) => setAddress({ ...address, city: e.target.value })} />
                <div className="grid grid-cols-2 gap-3">
                  <input className="input" placeholder="State" value={address.state} onChange={(e) => setAddress({ ...address, state: e.target.value })} />
                  <input className="input" placeholder="Pincode" value={address.pincode} onChange={(e) => setAddress({ ...address, pincode: e.target.value })} />
                </div>
                <input className="input" placeholder="Phone" value={address.phone} onChange={(e) => setAddress({ ...address, phone: e.target.value })} />
              </div>
            </div>

            <button className="btn btn-primary mt-6 w-full" onClick={handlePlaceOrder} disabled={placing}>
              {placing ? 'Placing order...' : 'Checkout'}
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
};

export default Cart;
