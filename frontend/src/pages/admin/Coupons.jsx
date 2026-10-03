import React, { useEffect, useState } from 'react';
import api from '../../api/axios';

const emptyForm = {
  code: '',
  discountType: 'percentage',
  discountValue: '',
  maxDiscount: '',
  minOrderAmount: '0',
  maxRedemptions: '',
  perUserLimit: '',
  cashbackPercent: '0',
  startsAt: '',
  expiresAt: '',
  isActive: true,
};

const toLocalDateTime = (value) => {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

const AdminCoupons = () => {
  const [coupons, setCoupons] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = () => api.get('/admin/coupons').then(({ data }) => setCoupons(data));

  useEffect(() => {
    load().catch(() => setError('Could not load promotions.'));
  }, []);

  const updateField = (event) => {
    const { name, value, type, checked } = event.target;
    setForm((current) => ({ ...current, [name]: type === 'checkbox' ? checked : value }));
  };

  const resetForm = () => {
    setEditingId(null);
    setForm(emptyForm);
  };

  const editCoupon = (coupon) => {
    setEditingId(coupon._id);
    setForm({
      code: coupon.code,
      discountType: coupon.discountType,
      discountValue: String(coupon.discountValue),
      maxDiscount: coupon.maxDiscount == null ? '' : String(coupon.maxDiscount),
      minOrderAmount: String(coupon.minOrderAmount || 0),
      maxRedemptions: coupon.maxRedemptions == null ? '' : String(coupon.maxRedemptions),
      perUserLimit: coupon.perUserLimit == null ? '' : String(coupon.perUserLimit),
      cashbackPercent: String(coupon.cashbackPercent || 0),
      startsAt: toLocalDateTime(coupon.startsAt),
      expiresAt: toLocalDateTime(coupon.expiresAt),
      isActive: coupon.isActive,
    });
    setError('');
  };

  const saveCoupon = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    const payload = {
      ...form,
      code: form.code.trim().toUpperCase(),
      discountValue: Number(form.discountValue),
      maxDiscount: form.maxDiscount ? Number(form.maxDiscount) : undefined,
      minOrderAmount: Number(form.minOrderAmount),
      maxRedemptions: form.maxRedemptions ? Number(form.maxRedemptions) : undefined,
      perUserLimit: form.perUserLimit ? Number(form.perUserLimit) : undefined,
      cashbackPercent: Number(form.cashbackPercent),
      startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : new Date().toISOString(),
      expiresAt: new Date(form.expiresAt).toISOString(),
    };

    try {
      if (editingId) await api.put(`/admin/coupons/${editingId}`, payload);
      else await api.post('/admin/coupons', payload);
      resetForm();
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Could not save this promotion.');
    } finally {
      setSaving(false);
    }
  };

  const toggleCoupon = async (coupon) => {
    try {
      await api.put(`/admin/coupons/${coupon._id}`, {
        code: coupon.code,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
        maxDiscount: coupon.maxDiscount,
        minOrderAmount: coupon.minOrderAmount,
        maxRedemptions: coupon.maxRedemptions,
        perUserLimit: coupon.perUserLimit,
        cashbackPercent: coupon.cashbackPercent || 0,
        startsAt: coupon.startsAt,
        expiresAt: coupon.expiresAt,
        isActive: !coupon.isActive,
      });
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Could not update this promotion.');
    }
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Marketing</p>
          <h2 className="mt-2 text-2xl font-bold text-slate-900 sm:text-[28px]">Promotions</h2>
        </div>
        <span className="admin-badge border-slate-200 bg-slate-50 text-slate-600">{coupons.length} codes</span>
      </div>

      <form className="admin-card mb-8 p-5 sm:p-6" onSubmit={saveCoupon}>
        <h3 className="text-lg font-semibold text-slate-900">{editingId ? 'Edit promotion' : 'Create promotion'}</h3>
        {error && <div role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{error}</div>}
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-xs font-semibold uppercase text-slate-500">Code
            <input className="input mt-1" name="code" value={form.code} onChange={updateField} maxLength={32} pattern="[A-Za-z0-9_-]{2,32}" required />
          </label>
          <label className="text-xs font-semibold uppercase text-slate-500">Discount type
            <select className="input mt-1" name="discountType" value={form.discountType} onChange={updateField}>
              <option value="percentage">Percentage</option>
              <option value="fixed">Fixed amount</option>
            </select>
          </label>
          <label className="text-xs font-semibold uppercase text-slate-500">Discount value
            <input className="input mt-1" name="discountValue" type="number" min="0.01" max={form.discountType === 'percentage' ? 100 : undefined} step="0.01" value={form.discountValue} onChange={updateField} required />
          </label>
          {form.discountType === 'percentage' && <label className="text-xs font-semibold uppercase text-slate-500">Maximum discount (optional)
            <input className="input mt-1" name="maxDiscount" type="number" min="0.01" step="0.01" value={form.maxDiscount} onChange={updateField} />
          </label>}
          <label className="text-xs font-semibold uppercase text-slate-500">Minimum order amount
            <input className="input mt-1" name="minOrderAmount" type="number" min="0" step="0.01" value={form.minOrderAmount} onChange={updateField} />
          </label>
          <label className="text-xs font-semibold uppercase text-slate-500">Total uses (optional)
            <input className="input mt-1" name="maxRedemptions" type="number" min="1" step="1" value={form.maxRedemptions} onChange={updateField} />
          </label>
          <label className="text-xs font-semibold uppercase text-slate-500">Uses per customer (optional)
            <input className="input mt-1" name="perUserLimit" type="number" min="1" step="1" value={form.perUserLimit} onChange={updateField} />
          </label>
          <label className="text-xs font-semibold uppercase text-slate-500">Cashback after delivery (%)
            <input className="input mt-1" name="cashbackPercent" type="number" min="0" max="100" step="0.01" value={form.cashbackPercent} onChange={updateField} />
          </label>
          <label className="text-xs font-semibold uppercase text-slate-500">Starts at
            <input className="input mt-1" name="startsAt" type="datetime-local" value={form.startsAt} onChange={updateField} />
          </label>
          <label className="text-xs font-semibold uppercase text-slate-500">Expires at
            <input className="input mt-1" name="expiresAt" type="datetime-local" value={form.expiresAt} onChange={updateField} required />
          </label>
          <label className="flex items-center gap-2 self-end pb-3 text-sm font-medium text-slate-700">
            <input name="isActive" type="checkbox" checked={form.isActive} onChange={updateField} /> Promotion active
          </label>
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? 'Saving…' : editingId ? 'Save promotion' : 'Create promotion'}</button>
          {editingId && <button className="btn btn-outline" type="button" onClick={resetForm}>Cancel</button>}
        </div>
      </form>

      <div className="overflow-x-auto rounded-[24px] border border-slate-200">
        <table className="w-full min-w-[900px] border-collapse bg-white">
          <thead><tr><th className="table-th">Code</th><th className="table-th">Offer</th><th className="table-th">Minimum</th><th className="table-th">Uses</th><th className="table-th">Cashback</th><th className="table-th">Expires</th><th className="table-th">State</th><th className="table-th"></th></tr></thead>
          <tbody>
            {coupons.map((coupon) => (
              <tr key={coupon._id}>
                <td className="table-td font-mono font-semibold text-slate-800">{coupon.code}</td>
                <td className="table-td">{coupon.discountType === 'percentage' ? `${coupon.discountValue}%` : `₹${Number(coupon.discountValue).toFixed(2)}`}{coupon.maxDiscount ? ` up to ₹${Number(coupon.maxDiscount).toFixed(2)}` : ''}</td>
                <td className="table-td">₹{Number(coupon.minOrderAmount || 0).toFixed(2)}</td>
                <td className="table-td">{coupon.redemptionCount || 0}{coupon.maxRedemptions ? ` / ${coupon.maxRedemptions}` : ''}</td>
                <td className="table-td">{Number(coupon.cashbackPercent || 0)}%</td>
                <td className="table-td">{new Date(coupon.expiresAt).toLocaleString()}</td>
                <td className="table-td">{coupon.isActive ? 'Active' : 'Paused'}</td>
                <td className="table-td"><div className="flex gap-3"><button className="link-btn" type="button" onClick={() => editCoupon(coupon)}>Edit</button><button className="link-btn" type="button" onClick={() => toggleCoupon(coupon)}>{coupon.isActive ? 'Pause' : 'Activate'}</button></div></td>
              </tr>
            ))}
            {!coupons.length && <tr><td className="table-td py-8 text-center text-slate-500" colSpan="8">No promotions have been created.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AdminCoupons;