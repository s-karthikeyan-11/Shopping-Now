from fastapi import FastAPI
from pydantic import BaseModel, Field
from typing import Optional, List

app = FastAPI(title='Marketplace AI Service', version='1.0.0')


class ListingInput(BaseModel):
    title: str = Field(..., min_length=3, max_length=200)
    description: str = Field(..., min_length=10, max_length=5000)
    category: str = Field(default='general')
    price: float = Field(default=0.0, ge=0)


class RiskInput(BaseModel):
    customerId: str
    orderTotal: float = Field(ge=0)
    items: List[str] = Field(default_factory=list)
    sellerScore: float = Field(default=0.0, ge=0, le=1)
    geoRisk: Optional[str] = 'low'


class EvidenceMetadata(BaseModel):
    mimeType: str = Field(..., min_length=3, max_length=100)
    bytes: int = Field(..., gt=0, le=104857600)
    sha256: str = Field(..., pattern=r'^[a-fA-F0-9]{64}$')


class EvidenceComparisonInput(BaseModel):
    disputeId: str = Field(..., min_length=1, max_length=100)
    reason: str = Field(..., min_length=3, max_length=100)
    packingEvidence: List[EvidenceMetadata] = Field(default_factory=list, max_length=20)
    unboxingEvidence: List[EvidenceMetadata] = Field(default_factory=list, max_length=20)


class ComplaintInput(BaseModel):
    description: str = Field(..., min_length=10, max_length=2000)
    reason: Optional[str] = Field(default='Other', max_length=100)


@app.get('/health')
def health():
    return {
        'status': 'ok',
        'service': 'marketplace-ai',
        'version': '1.0.0',
    }


@app.post('/inspect/listing')
def inspect_listing(payload: ListingInput):
    quality_score = min(0.98, max(0.45, (0.4 if payload.price > 0 else 0.2) + (0.25 if len(payload.description) > 80 else 0.15)))
    flagged = payload.title.lower().find('free') >= 0 or payload.description.lower().find('spam') >= 0
    return {
        'status': 'reviewed',
        'qualityScore': round(quality_score, 2),
        'riskLevel': 'high' if flagged else 'low',
        'recommendations': [
            'Ensure product title is clear and compliant.',
            'Keep pricing consistent with category benchmarks.',
            'Add evidence or photos for premium products.'
        ]
    }


@app.post('/inspect/order-risk')
def inspect_order_risk(payload: RiskInput):
    risk = payload.orderTotal * 0.0006 + (1 - payload.sellerScore) * 0.4
    risk_score = max(0.05, min(0.97, risk))
    return {
        'status': 'checked',
        'riskScore': round(risk_score, 2),
        'riskLevel': 'high' if risk_score > 0.65 else 'medium' if risk_score > 0.35 else 'low',
        'notes': [
            'Check delivery address validation.',
            'Verify payment source and order history.',
            'Monitor repeated high-value purchases for fraud patterns.'
        ]
    }


@app.post('/inspect/evidence-comparison')
def inspect_evidence_comparison(payload: EvidenceComparisonInput):
    """Return an explicitly non-visual baseline until a validated model is deployed.

    The marketplace sends evidence metadata only, never customer media, to this
    baseline endpoint. It must not infer damage, identity, or fraud from file
    names, hashes, or sizes.
    """
    return {
        'status': 'unavailable',
        'provider': 'baseline',
        'confidence': 0.0,
        'summary': (
            f'Received metadata for {len(payload.packingEvidence)} packing and '
            f'{len(payload.unboxingEvidence)} unboxing evidence file(s). '
            'No visual model is configured, so no object, damage, or authenticity conclusion was made.'
        ),
        'limitations': [
            'This baseline does not download or inspect image or video pixels.',
            'File hashes only help detect later file changes; they do not prove an event occurred.',
            'A trained, validated visual model and human review are required for evidence conclusions.'
        ],
        'result': {
            'packingEvidenceCount': len(payload.packingEvidence),
            'unboxingEvidenceCount': len(payload.unboxingEvidence),
            'objectsDetected': [],
            'damageObservations': [],
        },
    }


@app.post('/classify/complaint')
def classify_complaint(payload: ComplaintInput):
    text = f'{payload.reason} {payload.description}'.lower()
    keywords = {
        'Damaged item': ('damage', 'damaged', 'broken', 'crack', 'defect'),
        'Incorrect item': ('wrong', 'incorrect', 'different', 'mismatch'),
        'Missing item': ('missing', 'empty', 'not included'),
        'Tampered package': ('tamper', 'seal', 'opened'),
    }
    matches = [label for label, terms in keywords.items() if any(term in text for term in terms)]
    return {
        'status': 'baseline',
        'classification': matches[0] if len(matches) == 1 else 'Other',
        'confidence': 0.0,
        'limitations': [
            'This keyword baseline is not a trained classifier.',
            'It must not determine refund eligibility or accuse a person of fraud.'
        ],
    }
