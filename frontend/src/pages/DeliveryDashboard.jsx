import React, { useEffect, useState } from 'react';
import api from '../api/axios';

const DeliveryDashboard = () => {
  const [profile, setProfile] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [scan, setScan] = useState({ packageId: '', verificationToken: '' });
  const [application, setApplication] = useState({ contactNumber: '', vehicleType: '', vehicleNumber: '', serviceAreas: '' });

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/delivery/me');
      setProfile(data.profile);
      if (data.profile?.status === 'approved') {
        const { data: packageData } = await api.get('/delivery/assignments');
        setAssignments(packageData);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to load delivery workspace.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const scanPackage = async (event) => {
    event.preventDefault();
    setBusy('scan');
    setError('');
    try {
      await api.post('/delivery/scan', scan);
      setScan({ packageId: '', verificationToken: '' });
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Package scan could not be verified.');
    } finally {
      setBusy('');
    }
  };

  const submitApplication = async (event) => {
    event.preventDefault();
    setBusy('apply');
    setError('');
    try {
      await api.post('/delivery/apply', {
        contactNumber: application.contactNumber,
        vehicleType: application.vehicleType,
        vehicleNumber: application.vehicleNumber,
        serviceAreas: application.serviceAreas.split(',').map((value) => value.trim()).filter(Boolean),
      });
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to submit delivery-partner application.');
    } finally {
      setBusy('');
    }
  };

  const uploadProof = async (pkg, file) => {
    if (!file) return;
    setBusy(String(pkg._id));
    setError('');
    try {
      await api.post('/evidence/upload', file, { headers: {
        'Content-Type': file.type,
        'X-Evidence-Type': 'delivery_proof',
        'X-Package-Id': pkg._id,
        'X-File-Name': encodeURIComponent(file.name),
      } });
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to upload delivery proof.');
    } finally {
      setBusy('');
    }
  };

  const updateStatus = async (pkg, status) => {
    const deliveryPin = status === 'Delivered' ? window.prompt('Enter the delivery PIN shown by the customer:') : undefined;
    if (status === 'Delivered' && !deliveryPin) return;
    setBusy(String(pkg._id));
    setError('');
    try {
      await api.patch(`/delivery/packages/${pkg._id}/status`, { status, ...(deliveryPin ? { deliveryPin } : {}) });
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to update package status.');
    } finally {
      setBusy('');
    }
  };

  if (loading) return <div className="section-shell py-16 text-center text-slate-500">Loading delivery workspace...</div>;
  if (profile?.status !== 'approved') return <div className="section-shell py-16"><div className="mx-auto max-w-xl rounded-3xl border border-amber-200 bg-amber-50 p-8"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-800">Application status</p><h1 className="mt-2 text-3xl font-bold text-slate-900">{profile ? `Delivery partner ${profile.status}` : 'Apply as a delivery partner'}</h1><p className="mt-3 text-slate-700">Delivery assignments become available after an administrator verifies your account.</p>{error && <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}{(!profile || profile.status === 'rejected') && <form className="mt-6 grid gap-3" onSubmit={submitApplication}><input className="input" placeholder="Contact number" value={application.contactNumber} onChange={(event) => setApplication((value) => ({ ...value, contactNumber: event.target.value }))} required /><input className="input" placeholder="Vehicle type (e.g. Motorcycle)" value={application.vehicleType} onChange={(event) => setApplication((value) => ({ ...value, vehicleType: event.target.value }))} /><input className="input" placeholder="Vehicle number" value={application.vehicleNumber} onChange={(event) => setApplication((value) => ({ ...value, vehicleNumber: event.target.value }))} /><input className="input" placeholder="Service areas, comma separated" value={application.serviceAreas} onChange={(event) => setApplication((value) => ({ ...value, serviceAreas: event.target.value }))} /><button className="btn btn-primary justify-center" disabled={busy === 'apply'}>{busy === 'apply' ? 'Submitting…' : 'Submit application'}</button></form>}</div></div>;

  return <div className="section-shell py-8 sm:py-12">
    <div className="mb-6"><p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-800">Delivery workspace</p><h1 className="mt-2 text-3xl font-bold">Assigned packages</h1></div>
    {error && <p role="alert" className="mb-5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
    <form onSubmit={scanPackage} className="mb-6 grid gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-[1fr_1fr_auto]">
      <input className="input" placeholder="Package ID from QR" value={scan.packageId} onChange={(event) => setScan((value) => ({ ...value, packageId: event.target.value }))} required />
      <input className="input" placeholder="Verification token from scanner" value={scan.verificationToken} onChange={(event) => setScan((value) => ({ ...value, verificationToken: event.target.value }))} required />
      <button className="btn btn-primary" disabled={busy === 'scan'}>{busy === 'scan' ? 'Verifying…' : 'Verify QR scan'}</button>
      <p className="sm:col-span-3 text-xs text-slate-500">Use a QR scanner that supplies the signed package ID and verification token. Camera-scanner support can be added after selecting a supported device/browser policy.</p>
    </form>
    <div className="space-y-4">
      {assignments.map((pkg) => <article key={pkg._id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-mono text-sm font-semibold text-emerald-800">{pkg.packageId}</p><h2 className="mt-1 text-xl font-bold">{pkg.status}</h2><p className="mt-2 text-sm text-slate-600">{pkg.order?.shippingAddress?.line1}, {pkg.order?.shippingAddress?.city} · {pkg.order?.shippingAddress?.phone}</p></div><p className="text-sm text-slate-600">Seller: {pkg.seller?.name || 'Marketplace seller'}</p></div><div className="mt-5 flex flex-wrap gap-2">
        {['Assigned', 'Scanned'].includes(pkg.status) && <button type="button" className="btn btn-secondary" disabled={busy === String(pkg._id)} onClick={() => updateStatus(pkg, 'Picked Up')}>Mark picked up</button>}
        {pkg.status === 'Picked Up' && <button type="button" className="btn btn-secondary" disabled={busy === String(pkg._id)} onClick={() => updateStatus(pkg, 'In Transit')}>Mark in transit</button>}
        {pkg.status === 'In Transit' && <button type="button" className="btn btn-secondary" disabled={busy === String(pkg._id)} onClick={() => updateStatus(pkg, 'Out for Delivery')}>Out for delivery</button>}
        {pkg.status === 'Out for Delivery' && <><label className="btn btn-secondary cursor-pointer">Upload delivery proof<input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" onChange={(event) => uploadProof(pkg, event.target.files?.[0])} /></label><button type="button" className="btn btn-primary" disabled={busy === String(pkg._id)} onClick={() => updateStatus(pkg, 'Delivered')}>Verify PIN & deliver</button></>}
      </div></article>)}
      {!assignments.length && <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-10 text-center text-slate-600">No active package assignments.</div>}
    </div>
  </div>;
};

export default DeliveryDashboard;
