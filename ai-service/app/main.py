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
