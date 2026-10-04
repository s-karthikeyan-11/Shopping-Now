const AI_SERVICE_URL = (process.env.AI_SERVICE_URL || '').replace(/\/$/, '');

const inspectDisputeEvidence = async ({ dispute, packingEvidence, unboxingEvidence }) => {
  if (!AI_SERVICE_URL) {
    return {
      status: 'unavailable',
      provider: 'baseline',
      confidence: 0,
      summary: 'AI inspection is not configured. An administrator must review the original evidence.',
      limitations: ['No visual model was invoked.', 'This result must not be used to approve or reject a claim automatically.'],
      result: {},
    };
  }
  try {
    const response = await fetch(`${AI_SERVICE_URL}/inspect/evidence-comparison`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        disputeId: String(dispute._id),
        reason: dispute.reason,
        packingEvidence: packingEvidence.map((item) => ({ mimeType: item.mimeType, bytes: item.bytes, sha256: item.sha256 })),
        unboxingEvidence: unboxingEvidence.map((item) => ({ mimeType: item.mimeType, bytes: item.bytes, sha256: item.sha256 })),
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error('AI service rejected inspection');
    const data = await response.json();
    return {
      status: data.status === 'completed' ? 'completed' : 'unavailable',
      provider: data.provider === 'remote' ? 'remote' : 'baseline',
      confidence: Number.isFinite(data.confidence) ? Math.max(0, Math.min(1, data.confidence)) : 0,
      summary: String(data.summary || '').slice(0, 2000),
      limitations: Array.isArray(data.limitations) ? data.limitations.map((item) => String(item).slice(0, 500)).slice(0, 20) : [],
      result: data.result && typeof data.result === 'object' ? data.result : {},
    };
  } catch {
    return {
      status: 'unavailable',
      provider: 'baseline',
      confidence: 0,
      summary: 'AI inspection could not be completed. An administrator must review the original evidence.',
      limitations: ['The AI service was unavailable or did not return a usable result.', 'This result must not be used to approve or reject a claim automatically.'],
      result: {},
    };
  }
};

module.exports = { inspectDisputeEvidence };
