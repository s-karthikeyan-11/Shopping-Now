const API_ROOT = 'https://api.razorpay.com/v1';
const { decryptPayoutAccount, storePayoutAccount } = require('./sellerPayoutData');

const isConfigured = () => Boolean(
  process.env.RAZORPAYX_KEY_ID
  && process.env.RAZORPAYX_KEY_SECRET
  && process.env.RAZORPAYX_ACCOUNT_NUMBER
);

const request = async (path, { method = 'GET', body, idempotencyKey } = {}) => {
  if (!isConfigured()) throw Object.assign(new Error('RazorpayX payout credentials are not configured'), { status: 503 });
  const credentials = Buffer.from(`${process.env.RAZORPAYX_KEY_ID}:${process.env.RAZORPAYX_KEY_SECRET}`).toString('base64');
  const headers = {
    Authorization: `Basic ${credentials}`,
    Accept: 'application/json',
    ...(body ? { 'Content-Type': 'application/json' } : {}),
    ...(idempotencyKey ? { 'X-Payout-Idempotency': idempotencyKey } : {}),
  };
  const response = await fetch(`${API_ROOT}${path}`, {
    method,
    headers,
    signal: AbortSignal.timeout(20000),
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw Object.assign(new Error(data.error?.description || 'RazorpayX request failed'), {
      status: response.status,
      providerCode: data.error?.code,
    });
  }
  return data;
};

const ensureSellerFundAccount = async (profile, user) => {
  const payoutAccount = decryptPayoutAccount(profile);
  const phoneNumber = String(profile.contactNumber || '').replace(/\D/g, '');
  if (!/^[A-Za-z0-9 .'()/_-]{3,50}$/.test(payoutAccount.accountHolderName || '')
    || !/^[A-Z]{4}0[A-Z0-9]{6}$/i.test(payoutAccount.ifscCode || '')
    || !/^[A-Za-z0-9]{5,35}$/.test(payoutAccount.accountNumber || '')
    || !/^\d{10,15}$/.test(phoneNumber)) {
    throw Object.assign(new Error('Seller bank beneficiary details are invalid for RazorpayX'), { status: 409 });
  }
  if (!profile.razorpayXContactId) {
    const contact = await request('/contacts', {
      method: 'POST',
      body: {
        name: payoutAccount.accountHolderName,
        email: user.email,
        contact: phoneNumber,
        type: 'vendor',
        reference_id: String(profile._id),
      },
    });
    profile.razorpayXContactId = contact.id;
    await profile.save();
  }

  if (!profile.razorpayXFundAccountId) {
    const fundAccount = await request('/fund_accounts', {
      method: 'POST',
      body: {
        contact_id: profile.razorpayXContactId,
        account_type: 'bank_account',
        bank_account: {
          name: payoutAccount.accountHolderName,
          ifsc: payoutAccount.ifscCode.toUpperCase(),
          account_number: payoutAccount.accountNumber,
        },
      },
    });
    profile.razorpayXFundAccountId = fundAccount.id;
    await profile.save();
  }

  if (profile.payoutAccount.accountNumber) storePayoutAccount(profile, payoutAccount);
  await profile.save();
  return profile.razorpayXFundAccountId;
};

const sendSellerPayout = async ({ profile, user, settlement, idempotencyKey }) => {
  if (Math.round(Number(settlement.netAmount) * 100) < 100) {
    throw Object.assign(new Error('RazorpayX payouts must be at least ₹1.00'), { status: 400 });
  }
  const fundAccountId = await ensureSellerFundAccount(profile, user);
  return request('/payouts', {
    method: 'POST',
    idempotencyKey,
    body: {
      account_number: process.env.RAZORPAYX_ACCOUNT_NUMBER,
      fund_account_id: fundAccountId,
      amount: Math.round(settlement.netAmount * 100),
      currency: 'INR',
      mode: (process.env.RAZORPAYX_PAYOUT_MODE || 'IMPS').toUpperCase(),
      purpose: 'vendor bill',
      queue_if_low_balance: true,
      reference_id: String(settlement._id),
      narration: 'Marketplace payout',
      notes: { settlementId: String(settlement._id), sellerProfileId: String(profile._id) },
    },
  });
};

const fetchPayout = (payoutId) => request(`/payouts/${encodeURIComponent(payoutId)}`);

module.exports = { isConfigured, sendSellerPayout, fetchPayout };
