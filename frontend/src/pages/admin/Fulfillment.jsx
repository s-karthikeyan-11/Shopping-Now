import React, { useEffect, useState } from 'react';
import api from '../../api/axios';

const Fulfillment = () => {
  const [applications, setApplications] = useState([]);
  const [packages, setPackages] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  const load = async () => {
    try {
      const [{ data: applicationData }, { data: packageData }] = await Promise.all([
        api.get('/admin/delivery-partners'),
        api.get('/admin/packages'),
      ]);
      setApplications(applicationData);
      setPackages(packageData);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to load fulfilment operations.');
    }
  };

  useEffect(() => { load(); }, []);
  const approvedPartners = applications.filter((profile) => profile.status === 'approved');

  const setStatus = async (profile, status) => {
    setBusy(`${profile._id}-${status}`);
    setError('');
    try {
      await api.patch(`/admin/delivery-partners/${profile._id}/status`, { status });
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to update delivery-partner status.');
    } finally {
      setBusy('');
    }
  };

  const assign = async (packageId, deliveryPartnerId) => {
    if (!deliveryPartnerId) return;
    setBusy(packageId);
    setError('');
    try {
      await api.patch(`/admin/packages/${packageId}/assign`, { deliveryPartnerId });
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to assign package.');
    } finally {
      setBusy('');
    }
  };

  return <div className="space-y-8">
    <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Verified fulfilment</p><h2 className="mt-2 text-2xl font-bold text-slate-900">Delivery operations</h2></div>
    {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
    <section><h3 className="mb-3 text-lg font-bold">Delivery-partner applications</h3><div className="space-y-3">{applications.map((profile) => <article key={profile._id} className="rounded-2xl border border-slate-200 bg-white p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold text-slate-900">{profile.user?.name || 'Applicant'}</p><p className="text-sm text-slate-600">{profile.contactNumber} · {profile.vehicleType || 'Vehicle not specified'} {profile.vehicleNumber ? `· ${profile.vehicleNumber}` : ''}</p><p className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{profile.status}</p></div>{profile.status === 'pending' && <div className="flex gap-2"><button type="button" className="btn btn-primary" disabled={busy === `${profile._id}-approved`} onClick={() => setStatus(profile, 'approved')}>Approve</button><button type="button" className="btn btn-outline border-rose-200 text-rose-700" disabled={busy === `${profile._id}-rejected`} onClick={() => setStatus(profile, 'rejected')}>Reject</button></div>}</div></article>)}{!applications.length && <p className="rounded-2xl border border-dashed border-slate-200 bg-white p-7 text-sm text-slate-600">No delivery-partner applications.</p>}</div></section>
    <section><h3 className="mb-3 text-lg font-bold">Package assignment</h3><div className="space-y-3">{packages.map((pkg) => <article key={pkg._id} className="rounded-2xl border border-slate-200 bg-white p-4"><div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center"><div><p className="font-mono text-sm font-semibold text-emerald-800">{pkg.packageId}</p><p className="mt-1 font-semibold text-slate-900">{pkg.status} · Seller: {pkg.seller?.name || 'Unknown'}</p><p className="mt-1 text-sm text-slate-600">{pkg.order?.shippingAddress?.city || 'Address unavailable'} · {pkg.order?.shippingAddress?.pincode || ''}</p></div>{['Ready for Dispatch', 'Assigned'].includes(pkg.status) ? <select className="input max-w-sm" disabled={busy === pkg._id} value={pkg.assignedDeliveryPartner?._id || ''} onChange={(event) => assign(pkg._id, event.target.value)}><option value="">Assign approved delivery partner</option>{approvedPartners.map((partner) => <option key={partner._id} value={partner._id}>{partner.user?.name || partner._id} · {partner.contactNumber}</option>)}</select> : <p className="text-sm text-slate-500">{pkg.assignedDeliveryPartner?.user?.name ? `Assigned to ${pkg.assignedDeliveryPartner.user.name}` : 'No assignment required'}</p>}</div></article>)}{!packages.length && <p className="rounded-2xl border border-dashed border-slate-200 bg-white p-7 text-sm text-slate-600">No verified packages yet.</p>}</div></section>
  </div>;
};

export default Fulfillment;
