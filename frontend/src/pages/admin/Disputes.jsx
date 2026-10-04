import React, { useEffect, useState } from 'react';
import api from '../../api/axios';

const Disputes = () => {
  const [disputes, setDisputes] = useState([]);
  const [logs, setLogs] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  const load = async () => {
    try {
      const [{ data: disputeData }, { data: auditData }] = await Promise.all([api.get('/admin/disputes'), api.get('/admin/audit-logs', { params: { limit: 50 } })]);
      setDisputes(disputeData);
      setLogs(auditData);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to load disputes and audit history.');
    }
  };
  useEffect(() => { load(); }, []);

  const review = async (dispute, decision) => {
    const note = window.prompt(decision === 'under_review' ? 'Optional review note:' : `Reason for ${decision}:`) || '';
    setBusy(dispute._id);
    setError('');
    try {
      await api.patch(`/admin/disputes/${dispute._id}`, { decision, note });
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to review dispute.');
    } finally {
      setBusy('');
    }
  };

  return <div className="space-y-8"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Evidence resolution</p><h2 className="mt-2 text-2xl font-bold text-slate-900">Disputes and audit trail</h2></div>{error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}<section><h3 className="mb-3 text-lg font-bold">Customer disputes</h3><div className="space-y-3">{disputes.map((dispute) => <article key={dispute._id} className="rounded-2xl border border-slate-200 bg-white p-5"><div className="flex flex-wrap justify-between gap-3"><div><p className="font-semibold text-slate-900">{dispute.reason} · {dispute.status}</p><p className="mt-1 text-sm text-slate-600">{dispute.customer?.name} · {dispute.package?.packageId}</p></div><p className="text-xs text-slate-500">{new Date(dispute.createdAt).toLocaleString()}</p></div><p className="mt-4 whitespace-pre-wrap text-sm text-slate-700">{dispute.description}</p>{dispute.sellerResponse?.text && <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-700"><strong>Seller response:</strong> {dispute.sellerResponse.text}</p>}<p className="mt-3 text-xs text-slate-500">Evidence items: {dispute.evidence?.length || 0}. AI is advisory only and cannot decide the claim.</p>{['Open', 'Seller Responded', 'Under Review'].includes(dispute.status) && <div className="mt-4 flex flex-wrap gap-2"><button type="button" className="btn btn-outline" disabled={busy === dispute._id} onClick={() => review(dispute, 'under_review')}>Mark under review</button><button type="button" className="btn btn-primary" disabled={busy === dispute._id} onClick={() => review(dispute, 'approve')}>Approve evidence decision</button><button type="button" className="btn btn-outline border-rose-200 text-rose-700" disabled={busy === dispute._id} onClick={() => review(dispute, 'reject')}>Reject evidence decision</button></div>}</article>)}{!disputes.length && <p className="rounded-2xl border border-dashed border-slate-200 bg-white p-7 text-sm text-slate-600">No disputes to review.</p>}</div></section><section><h3 className="mb-3 text-lg font-bold">Recent audit events</h3><div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">{logs.map((log) => <div key={log._id} className="border-b border-slate-100 px-4 py-3 text-sm last:border-b-0"><span className="font-mono text-xs text-emerald-800">{log.action}</span><span className="ml-3 text-slate-700">{log.actor?.name || log.actorRole}</span><time className="ml-3 text-xs text-slate-500">{new Date(log.createdAt).toLocaleString()}</time></div>)}{!logs.length && <p className="p-5 text-sm text-slate-600">No audit events recorded yet.</p>}</div></section></div>;
};

export default Disputes;
