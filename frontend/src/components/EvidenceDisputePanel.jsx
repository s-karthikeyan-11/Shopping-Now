import React, { useCallback, useEffect, useState } from 'react';
import api from '../api/axios';

const REASONS = ['Damaged item', 'Incorrect item', 'Missing item', 'Tampered package', 'Other'];

const EvidenceDisputePanel = ({ order }) => {
  const [packages, setPackages] = useState([]);
  const [evidence, setEvidence] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [forms, setForms] = useState({});
  const [deliveryPins, setDeliveryPins] = useState({});
  const [inspection, setInspection] = useState(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/packages/order/${order._id}`);
      setPackages(data);
      const entries = await Promise.all(data.map(async (pkg) => {
        const response = await api.get(`/evidence/package/${pkg._id}`);
        return [pkg._id, response.data.evidence];
      }));
      setEvidence(Object.fromEntries(entries));
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Verified package evidence could not be loaded.');
    }
  }, [order._id]);

  useEffect(() => { load(); }, [load]);

  const uploadUnboxing = async (pkg, file) => {
    if (!file) return;
    setBusy(String(pkg._id));
    setError('');
    try {
      await api.post('/evidence/upload', file, { headers: {
        'Content-Type': file.type,
        'X-Evidence-Type': 'unboxing',
        'X-Package-Id': pkg._id,
        'X-File-Name': encodeURIComponent(file.name),
      } });
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to upload unboxing evidence.');
    } finally {
      setBusy('');
    }
  };

  const showDeliveryPin = async (pkg) => {
    setBusy(`pin-${pkg._id}`);
    setError('');
    try {
      const { data } = await api.get(`/packages/${pkg._id}/delivery-pin`);
      setDeliveryPins((current) => ({ ...current, [pkg._id]: data.deliveryPin }));
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'The delivery PIN is not available yet.');
    } finally {
      setBusy('');
    }
  };

  const submitDispute = async (event, pkg) => {
    event.preventDefault();
    const form = forms[pkg._id] || {};
    setBusy(`dispute-${pkg._id}`);
    setError('');
    try {
      const unboxingEvidence = (evidence[pkg._id] || []).filter((item) => item.type === 'unboxing').map((item) => item._id);
      const { data } = await api.post('/disputes', {
        packageId: pkg._id,
        reason: form.reason,
        description: form.description,
        evidenceIds: unboxingEvidence,
      });
      setInspection(data.aiInspection);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to submit the dispute.');
    } finally {
      setBusy('');
    }
  };

  if (!packages.length && !error) return null;
  return <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
    <h2 className="text-lg font-bold">Verified packing and unboxing evidence</h2>
    <p className="mt-1 text-sm text-slate-600">Evidence hashes help detect later file changes. They do not by themselves prove what happened, so disputes are reviewed by an administrator.</p>
    {error && <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
    <div className="mt-5 space-y-5">
      {packages.map((pkg) => {
        const files = evidence[pkg._id] || [];
        const form = forms[pkg._id] || { reason: '', description: '' };
        return <div key={pkg._id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-mono text-sm font-semibold text-emerald-800">{pkg.packageId}</p><p className="mt-1 text-sm text-slate-600">Package status: {pkg.status}</p></div>{pkg.status === 'Out for Delivery' && <button type="button" className="btn btn-secondary" disabled={busy === `pin-${pkg._id}`} onClick={() => showDeliveryPin(pkg)}>{deliveryPins[pkg._id] || 'Show delivery PIN'}</button>}</div>
          {files.length > 0 && <ul className="mt-4 space-y-2">{files.map((item) => <li key={item._id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-3 text-sm"><span><strong className="capitalize">{item.type.replace('_', ' ')}</strong> · {item.originalFilename} · SHA-256 {item.sha256.slice(0, 12)}…</span><a className="font-semibold text-emerald-800 underline" href={`${api.defaults.baseURL}/evidence/${item._id}/content`} target="_blank" rel="noreferrer">View</a></li>)}</ul>}
          {pkg.status === 'Delivered' && <><div className="mt-4"><label className="btn btn-secondary cursor-pointer">{busy === String(pkg._id) ? 'Uploading…' : 'Upload unboxing evidence'}<input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" onChange={(event) => uploadUnboxing(pkg, event.target.files?.[0])} /></label></div><form className="mt-4 grid gap-3" onSubmit={(event) => submitDispute(event, pkg)}><select className="input" value={form.reason} onChange={(event) => setForms((current) => ({ ...current, [pkg._id]: { ...form, reason: event.target.value } }))} required><option value="" disabled>Choose complaint reason</option>{REASONS.map((reason) => <option key={reason} value={reason}>{reason}</option>)}</select><textarea className="input min-h-24" placeholder="Describe the issue and what you observed" value={form.description} onChange={(event) => setForms((current) => ({ ...current, [pkg._id]: { ...form, description: event.target.value } }))} minLength={10} maxLength={2000} required /><button className="btn btn-primary w-fit" disabled={busy === `dispute-${pkg._id}`}>{busy === `dispute-${pkg._id}` ? 'Submitting…' : 'Submit evidence-based complaint'}</button></form></>}
        </div>;
      })}
    </div>
    {inspection && <div className="mt-5 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950"><p className="font-semibold">AI inspection status: {inspection.status}</p><p className="mt-1">{inspection.summary}</p><p className="mt-2 text-xs">This is advisory only; an administrator makes the decision.</p></div>}
  </section>;
};

export default EvidenceDisputePanel;
