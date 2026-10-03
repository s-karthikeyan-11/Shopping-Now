import React, { useEffect, useState } from 'react';
import api from '../../api/axios';

const AdminSellers = () => {
  const [applications, setApplications] = useState([]);
  const [error, setError] = useState('');
  const [commissionRates, setCommissionRates] = useState({});

  const load = () => api.get('/sellers/applications').then(({ data }) => setApplications(data));

  useEffect(() => {
    load();
  }, []);

  const updateStatus = async (id, status) => {
    try {
      await api.patch(`/sellers/${id}/status`, { status });
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Could not update seller status.');
    }
  };

  const reviewDocument = async (profileId, documentId, status) => {
    try {
      await api.patch(`/sellers/${profileId}/documents/${documentId}`, { status });
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Could not update document review.');
    }
  };

  const updateCompliance = async (profileId, status) => {
    try {
      await api.patch(`/sellers/${profileId}/compliance`, { status });
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Could not update payout compliance.');
    }
  };

  const updateCommission = async (profileId) => {
    const commissionRate = Number(commissionRates[profileId]);
    if (!Number.isFinite(commissionRate) || commissionRate < 0 || commissionRate > 100) {
      setError('Commission must be between 0 and 100 percent.');
      return;
    }
    try {
      await api.patch(`/sellers/${profileId}/commission`, { commissionRate });
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Could not update seller commission.');
    }
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Marketplace</p>
          <h2 className="mt-2 text-2xl font-bold text-slate-900 sm:text-[28px]">Seller approvals</h2>
        </div>
        <span className="admin-badge border-slate-200 bg-slate-50 text-slate-600">{applications.length} requests</span>
      </div>

      {error && <div role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}

      <div className="space-y-4">
        {applications.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center text-slate-500">
            No seller applications yet.
          </div>
        )}

        {applications.map((app) => (
          <div key={app._id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="flex items-center gap-3">
                  <h3 className="text-xl font-bold text-slate-900">{app.businessName}</h3>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.12em] ${
                    app.status === 'approved' ? 'bg-emerald-100 text-emerald-700' :
                    app.status === 'rejected' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'
                  }`}>
                    {app.status}
                  </span>
                </div>
                <p className="mt-2 text-sm text-slate-600">Owner: {app.user?.name || 'Unknown'} | Email: {app.user?.email || 'N/A'}</p>
                <p className="mt-1 text-sm text-slate-600">Contact: {app.contactNumber}</p>
                <p className="mt-1 text-sm text-slate-600">Address: {app.businessAddress}</p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => updateStatus(app._id, 'approved')} className="rounded-xl bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500">
                  Approve
                </button>
                <button type="button" onClick={() => updateStatus(app._id, 'rejected')} className="rounded-xl bg-rose-600 px-3 py-2 text-sm font-medium text-white hover:bg-rose-500">
                  Reject
                </button>
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">GST</p>
                <p className="mt-1 text-sm font-medium text-slate-800">{app.gstNumber || 'Not provided'}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Bank</p>
                <p className="mt-1 text-sm font-medium text-slate-800">{app.payoutAccount?.bankName || 'N/A'}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Account</p>
                <p className="mt-1 text-sm font-medium text-slate-800">{app.payoutAccount?.accountNumber || 'N/A'}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">IFSC</p>
                <p className="mt-1 text-sm font-medium text-slate-800">{app.payoutAccount?.ifscCode || 'N/A'}</p>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-800">Payout compliance: <span className="capitalize">{app.complianceStatus || 'pending'}</span></p>
                  {app.complianceNote && <p className="mt-1 text-xs text-slate-500">{app.complianceNote}</p>}
                </div>
                <button type="button" onClick={() => updateCompliance(app._id, 'verified')} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-600">Verify payout setup</button>
              </div>
              <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3">
                <label className="text-xs font-semibold text-slate-600">Commission rate (%)
                  <input className="input mt-1 w-28" type="number" min="0" max="100" step="0.1" value={commissionRates[app._id] ?? app.commissionRate ?? 8} onChange={(event) => setCommissionRates((current) => ({ ...current, [app._id]: event.target.value }))} />
                </label>
                <button type="button" className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50" onClick={() => updateCommission(app._id)}>Save commission</button>
              </div>
              <div className="mt-3 space-y-2">
                {(app.verificationDocuments || []).map((document) => (
                  <div key={document._id} className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2 text-sm">
                    <div className="min-w-0">
                      {document.url?.startsWith('https://') ? <a className="font-medium text-blue-700 underline" href={document.url} target="_blank" rel="noreferrer">{document.name}</a> : <span className="font-medium">{document.name}</span>}
                      <span className="ml-2 text-xs capitalize text-slate-500">{document.status}</span>
                      {document.reviewNote && <p className="text-xs text-slate-500">{document.reviewNote}</p>}
                    </div>
                    {document.status !== 'approved' && <button type="button" className="text-xs font-semibold text-emerald-700" onClick={() => reviewDocument(app._id, document._id, 'approved')}>Approve document</button>}
                    {document.status !== 'rejected' && <button type="button" className="text-xs font-semibold text-rose-700" onClick={() => reviewDocument(app._id, document._id, 'rejected')}>Reject document</button>}
                  </div>
                ))}
                {!app.verificationDocuments?.length && <p className="border-t border-slate-100 pt-2 text-xs text-slate-500">No verification documents submitted.</p>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AdminSellers;
