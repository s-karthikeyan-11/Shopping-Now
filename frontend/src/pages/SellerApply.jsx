import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api/axios';

const initialState = {
  businessName: '',
  contactNumber: '',
  gstNumber: '',
  businessAddress: '',
  bankName: '',
  accountHolderName: '',
  accountNumber: '',
  ifscCode: '',
  documentName: '',
  documentUrl: '',
};

const SellerApply = () => {
  const navigate = useNavigate();
  const [form, setForm] = useState(initialState);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      const payload = {
        businessName: form.businessName,
        contactNumber: form.contactNumber,
        gstNumber: form.gstNumber,
        businessAddress: form.businessAddress,
        payoutAccount: {
          bankName: form.bankName,
          accountHolderName: form.accountHolderName,
          accountNumber: form.accountNumber,
          ifscCode: form.ifscCode,
        },
        verificationDocuments: form.documentUrl.trim()
          ? [{ name: form.documentName, url: form.documentUrl.trim() }]
          : [],
      };

      await api.post('/sellers/apply', payload);
      navigate('/seller');
    } catch (err) {
      setError(err.response?.data?.message || 'Seller application failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Seller onboarding</p>
            <h1 className="mt-2 text-3xl font-bold text-slate-900">Become a seller</h1>
          </div>
          <Link to="/profile" className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
            Back to profile
          </Link>
        </div>

        <form onSubmit={handleSubmit} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          {error && <div className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{error}</div>}

          <div className="grid gap-5 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Business name</label>
              <input className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none focus:border-emerald-600 focus:bg-white" name="businessName" value={form.businessName} onChange={handleChange} required />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Contact number</label>
              <input className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none focus:border-emerald-600 focus:bg-white" name="contactNumber" value={form.contactNumber} onChange={handleChange} required />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">GST number</label>
              <input className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none focus:border-emerald-600 focus:bg-white" name="gstNumber" value={form.gstNumber} onChange={handleChange} />
            </div>

            <div className="md:col-span-2">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Business address</label>
              <textarea className="min-h-[110px] w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none focus:border-emerald-600 focus:bg-white" name="businessAddress" value={form.businessAddress} onChange={handleChange} required />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Bank name</label>
              <input className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none focus:border-emerald-600 focus:bg-white" name="bankName" value={form.bankName} onChange={handleChange} />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Account holder name</label>
              <input className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none focus:border-emerald-600 focus:bg-white" name="accountHolderName" value={form.accountHolderName} onChange={handleChange} />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Account number</label>
              <input className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none focus:border-emerald-600 focus:bg-white" name="accountNumber" value={form.accountNumber} onChange={handleChange} />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">IFSC code</label>
              <input className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none focus:border-emerald-600 focus:bg-white" name="ifscCode" value={form.ifscCode} onChange={handleChange} />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Verification document name</label>
              <input className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none focus:border-emerald-600 focus:bg-white" name="documentName" value={form.documentName} onChange={handleChange} maxLength={100} placeholder="Business registration" />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Secure document URL</label>
              <input className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 outline-none focus:border-emerald-600 focus:bg-white" name="documentUrl" type="url" value={form.documentUrl} onChange={handleChange} maxLength={2048} placeholder="https://..." />
              <p className="mt-1 text-xs text-slate-500">Use a private HTTPS link accessible to your marketplace administrator.</p>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <button type="submit" disabled={loading} className="rounded-xl bg-emerald-700 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-60">
              {loading ? 'Submitting...' : 'Submit seller request'}
            </button>
            <Link to="/profile" className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-100">
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SellerApply;
