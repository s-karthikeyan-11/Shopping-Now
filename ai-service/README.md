# AI Marketplace Service

This service acts as the intelligence layer for the marketplace. It is intentionally lightweight but ready for expansion into moderation, catalog review, buyer risk detection, and customer support automation.

## Available endpoints

- `GET /health`
- `POST /inspect/listing`
- `POST /inspect/order-risk`

## Example request

```json
{
  "title": "Premium Smartwatch",
  "description": "Water-resistant GPS smartwatch for fitness use.",
  "price": 7999,
  "category": "electronics"
}
```

## Notes

This service is designed to be called by the main Node API when a seller uploads a listing or an order requires review. It can be extended with vendor scoring, fraud checks, and AI-generated recommendations.
