# Shopnow — Multi-Vendor Marketplace Foundation

This project is a full-stack commerce application with a customer storefront, seller onboarding flow, admin reporting, and AI-powered marketplace support foundations. It is structured to evolve into a real-world multi-vendor marketplace while remaining compatible with the current working e-commerce base.

## Features

**Customer**
- Browse products with price, discount %, GST %, computed final price, and stock
- Register / log in (JWT auth)
- Add products to cart, update quantity, remove items, and check out
- Place Cash on Delivery or Razorpay orders and view order history
- Track forward and return shipments, request returns, and view refund status
- Apply limited-use promotions and receive eligible cashback in the wallet after paid delivery

**Seller**
- Submit seller profile and business details for review
- Manage inventory and fulfillment orders after approval
- Submit verification evidence and view commission-based settlement history
- Create a package ID and QR code, upload tamper-evident packing evidence, and mark a package ready for dispatch

**Verified fulfilment and dispute review**
- Seller packing evidence, customer unboxing evidence, and delivery proof are uploaded through a byte-validated storage boundary
- Each evidence record stores uploader, timestamp, SHA-256 hash, package/order association, and an audit event
- Delivery partners can be approved, assigned a package, scan its QR token, update delivery milestones, and verify the buyer delivery PIN
- Customers can open an evidence-based dispute; AI output is explicitly advisory and never performs an automatic refund or fraud decision
- The return-request deadline is calculated server-side from `deliveredAt`; customers have 24 hours to submit a request

**Admin**
- Dashboard: total users, products, orders, sales, low-stock items, and revenue charts
- Add / edit / delete products
- Review orders, returns, users, seller applications, and verification documents
- Manage promotions, commission rates, COD reconciliation, and seller settlement references

**AI-enabled marketplace foundations**
- AI service for product and marketplace moderation analysis
- Future-ready scaffolding for dispute evidence, quality scoring, and customer support assistance

## Multi-vendor architecture

The application now includes:

- a customer storefront for browsing and checkout
- a seller role and onboarding workflow
- admin reporting and review tools
- an AI service layer for future moderation and recommendations

## Setup

### 1. Backend

```bash
cd backend
npm install
npm run dev
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev -- --host 0.0.0.0
```

### 3. AI service

```bash
cd ai-service
python -m venv .venv
. .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## Important routes

- Public auth: `/api/auth/register`, `/api/auth/login`
- Products: `/api/products`
- Customer cart and orders: `/api/cart`, `/api/orders`
- Coupon validation and cashback wallet: `/api/coupons/validate`, `/api/wallet`
- Seller onboarding: `/api/sellers/apply`, `/api/sellers/me`
- Admin dashboard: `/api/admin/dashboard`
- Seller review: `/api/sellers/applications`, `/api/sellers/:id/status`
- Razorpay refund webhook: `/api/webhooks/razorpay`
- RazorpayX payout webhook: `/api/webhooks/razorpayx`
- Packages: `/api/packages`
- Evidence: `/api/evidence` (`POST /api/evidence/upload` uses a raw image/video request)
- Delivery partner workflow: `/api/delivery`
- Evidence-based disputes: `/api/disputes`

## Notes

- Seller approvals are implemented as a foundation workflow for marketplace onboarding.
- Configure `RAZORPAY_WEBHOOK_SECRET` in the backend environment and subscribe to Razorpay `payment.captured`, `refund.processed`, and `refund.failed` events at `/api/webhooks/razorpay` for payment/refund reconciliation.
- RazorpayX payout variables are `RAZORPAYX_KEY_ID`, `RAZORPAYX_KEY_SECRET`, `RAZORPAYX_ACCOUNT_NUMBER`, `RAZORPAYX_PAYOUT_MODE`, and `RAZORPAYX_WEBHOOK_SECRET`. The source account must be enabled for payouts and the server IP must be allowlisted in RazorpayX.
- Set `SELLER_PAYOUT_ENCRYPTION_KEY` to a unique 32-byte key encoded as 64 hexadecimal characters. Generate one locally with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`; do not share or commit it.
- Before production startup, configure the encryption key and run `npm run migrate:seller-payout-data` from `backend/` once to encrypt any existing seller bank-account numbers. Keep the same key backed up securely; losing it makes encrypted payout details unrecoverable.
- Configure the RazorpayX webhook at the public URL `/api/webhooks/razorpayx` with `RAZORPAYX_WEBHOOK_SECRET`. Subscribe to `payout.pending`, `payout.queued`, `payout.initiated`, `payout.processed`, `payout.updated`, `payout.rejected`, `payout.failed`, and `payout.reversed`.
- Seller payouts are sent through RazorpayX when configured and are otherwise manually reconcilable only in development. RazorpayX requires a live account, enabled payouts, and server IP allowlisting.
- Development shipping defaults to a deterministic mock adapter. Production requires `SHIPPING_PROVIDER=delhivery`, a Delhivery API token/auth header, account-specific HTTPS endpoint URLs and HTTP methods, JSON payload templates, and response field-path mappings. Templates can interpolate normalized values such as `{{order.id}}`, `{{order.shippingAddress.pincode}}`, and `{{shipment.trackingNumber}}`; configure them only from the API schema in your Delhivery account. Production startup fails if any required mapping is missing.
- Shipment creation, tracking refresh, shipment cancellation, reverse pickup, and pickup cancellation all use the same provider adapter. If a carrier create call times out ambiguously, the order is locked for manual reconciliation instead of issuing a duplicate shipment.
- The AI service is intentionally lightweight and can be extended into product moderation, fraud alerts, and review assistance.
- Evidence upload requires `CLOUDINARY_CLOUD_NAME` and `CLOUDINARY_EVIDENCE_UPLOAD_PRESET`. The preset must be restricted to approved media formats, a strict size limit, and private/authenticated delivery; uploads fail safely with `503` until it is configured.
- Set `PACKAGE_SECURITY_KEY` to a separately generated 64-hex-character key in production. It encrypts delivery QR tokens and buyer delivery PINs at rest.
- The included AI evidence endpoint is metadata-only baseline behaviour with zero confidence. It never claims to inspect pixels or make a refund/fraud decision; deploy a trained model only with documented evaluation and human review.
- The current codebase remains compatible with the existing storefront and admin dashboard while adding the vendor marketplace layer.
