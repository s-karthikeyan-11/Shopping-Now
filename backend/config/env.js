const insecureJwtSecrets = new Set([
  'change_this_to_a_long_random_secret',
  'replace_with_a_unique_32_plus_character_secret',
  'secret',
  'jwt_secret',
]);

const getClientOrigins = () =>
  (process.env.CLIENT_URL || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

const getCookieSameSite = () => (process.env.COOKIE_SAME_SITE || 'lax').trim().toLowerCase();

const delhiverySettings = [
  'DELHIVERY_API_TOKEN',
  'DELHIVERY_AUTH_HEADER',
  'DELHIVERY_CREATE_SHIPMENT_METHOD',
  'DELHIVERY_CREATE_REVERSE_PICKUP_METHOD',
  'DELHIVERY_TRACKING_METHOD',
  'DELHIVERY_CANCEL_SHIPMENT_METHOD',
  'DELHIVERY_CANCEL_REVERSE_PICKUP_METHOD',
  'DELHIVERY_CREATE_SHIPMENT_URL',
  'DELHIVERY_CREATE_REVERSE_PICKUP_URL',
  'DELHIVERY_TRACKING_URL_TEMPLATE',
  'DELHIVERY_CANCEL_SHIPMENT_URL_TEMPLATE',
  'DELHIVERY_CANCEL_REVERSE_PICKUP_URL_TEMPLATE',
  'DELHIVERY_SHIPMENT_PAYLOAD_TEMPLATE',
  'DELHIVERY_REVERSE_PICKUP_PAYLOAD_TEMPLATE',
  'DELHIVERY_CANCEL_PAYLOAD_TEMPLATE',
  'DELHIVERY_SHIPMENT_ID_PATH',
  'DELHIVERY_TRACKING_NUMBER_PATH',
  'DELHIVERY_TRACKING_STATUS_PATH',
  'DELHIVERY_TRACKING_EVENTS_PATH',
  'DELHIVERY_EVENT_STATUS_PATH',
  'DELHIVERY_EVENT_TIME_PATH',
];

const validateEnvironment = () => {
  const missing = ['MONGO_URI', 'JWT_SECRET', 'RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET']
    .filter((key) => !process.env[key]);
  if (missing.length) throw new Error(`Missing required environment variables: ${missing.join(', ')}`);

  const isProduction = process.env.NODE_ENV === 'production';
  const jwtSecret = process.env.JWT_SECRET;

  if (isProduction && (jwtSecret.length < 32 || insecureJwtSecrets.has(jwtSecret.toLowerCase()))) {
    throw new Error('JWT_SECRET must be a unique random value of at least 32 characters in production');
  }
  if (isProduction && getClientOrigins().length === 0) {
    throw new Error('CLIENT_URL must be configured in production');
  }
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || '';
  if (isProduction && (webhookSecret.length < 16 || webhookSecret.toLowerCase().startsWith('replace_'))) {
    throw new Error('RAZORPAY_WEBHOOK_SECRET must be a real secret of at least 16 characters in production');
  }
  const razorpayXSettings = [
    process.env.RAZORPAYX_KEY_ID,
    process.env.RAZORPAYX_KEY_SECRET,
    process.env.RAZORPAYX_ACCOUNT_NUMBER,
  ];
  const hasRazorpayXSettings = razorpayXSettings.some(Boolean);
  if (hasRazorpayXSettings && razorpayXSettings.some((value) => !value)) {
    throw new Error('RAZORPAYX_KEY_ID, RAZORPAYX_KEY_SECRET, and RAZORPAYX_ACCOUNT_NUMBER must be configured together');
  }
  if (hasRazorpayXSettings && isProduction) {
    const payoutWebhookSecret = process.env.RAZORPAYX_WEBHOOK_SECRET || '';
    if (payoutWebhookSecret.length < 16 || payoutWebhookSecret.toLowerCase().startsWith('replace_')) {
      throw new Error('RAZORPAYX_WEBHOOK_SECRET must be configured when RazorpayX payouts are enabled');
    }
  }
  const encryptionKey = process.env.SELLER_PAYOUT_ENCRYPTION_KEY || '';
  if (isProduction && !/^[a-f0-9]{64}$/i.test(encryptionKey)) {
    throw new Error('SELLER_PAYOUT_ENCRYPTION_KEY must be a 32-byte hexadecimal key in production');
  }
  const packageSecurityKey = process.env.PACKAGE_SECURITY_KEY || '';
  if (isProduction && !/^[a-f0-9]{64}$/i.test(packageSecurityKey)) {
    throw new Error('PACKAGE_SECURITY_KEY must be a 32-byte hexadecimal key in production');
  }
  if (process.env.RAZORPAYX_PAYOUT_MODE && !['IMPS', 'NEFT', 'RTGS'].includes(process.env.RAZORPAYX_PAYOUT_MODE.toUpperCase())) {
    throw new Error('RAZORPAYX_PAYOUT_MODE must be IMPS, NEFT, or RTGS');
  }
  const shippingProvider = (process.env.SHIPPING_PROVIDER || (isProduction ? 'delhivery' : 'mock')).toLowerCase();
  if (!['mock', 'delhivery'].includes(shippingProvider)) {
    throw new Error('SHIPPING_PROVIDER must be mock or delhivery');
  }
  if (isProduction && shippingProvider !== 'delhivery') {
    throw new Error('Production must use the configured Delhivery shipping provider');
  }
  if (isProduction && shippingProvider === 'delhivery') {
    const missingDelhiverySettings = delhiverySettings.filter((name) => !process.env[name]);
    if (missingDelhiverySettings.length) {
      throw new Error(`Missing Delhivery configuration: ${missingDelhiverySettings.join(', ')}`);
    }
    if (!/^[A-Za-z0-9-]+$/.test(process.env.DELHIVERY_AUTH_HEADER)) {
      throw new Error('DELHIVERY_AUTH_HEADER must be a valid HTTP header name');
    }
    if (process.env.DELHIVERY_API_TOKEN.toLowerCase().startsWith('replace_')) {
      throw new Error('DELHIVERY_API_TOKEN must be a real account token in production');
    }
    for (const name of ['DELHIVERY_CREATE_SHIPMENT_URL', 'DELHIVERY_CREATE_REVERSE_PICKUP_URL']) {
      let endpoint;
      try {
        endpoint = new URL(process.env[name]);
      } catch {
        throw new Error(`${name} must be a valid absolute HTTPS URL`);
      }
      if (endpoint.protocol !== 'https:') throw new Error(`${name} must use HTTPS`);
    }
    for (const name of ['DELHIVERY_TRACKING_URL_TEMPLATE', 'DELHIVERY_CANCEL_SHIPMENT_URL_TEMPLATE', 'DELHIVERY_CANCEL_REVERSE_PICKUP_URL_TEMPLATE']) {
      const testUrl = process.env[name].replace(/\{\{[A-Za-z0-9_.]+\}\}/g, 'value');
      let endpoint;
      try {
        endpoint = new URL(testUrl);
      } catch {
        throw new Error(`${name} must be a valid absolute HTTPS URL template`);
      }
      if (endpoint.protocol !== 'https:') throw new Error(`${name} must use HTTPS`);
    }
    for (const name of ['DELHIVERY_CREATE_SHIPMENT_METHOD', 'DELHIVERY_CREATE_REVERSE_PICKUP_METHOD', 'DELHIVERY_TRACKING_METHOD', 'DELHIVERY_CANCEL_SHIPMENT_METHOD', 'DELHIVERY_CANCEL_REVERSE_PICKUP_METHOD']) {
      if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(process.env[name].toUpperCase())) {
        throw new Error(`${name} must be a supported HTTP method`);
      }
    }
    for (const name of ['DELHIVERY_SHIPMENT_PAYLOAD_TEMPLATE', 'DELHIVERY_REVERSE_PICKUP_PAYLOAD_TEMPLATE', 'DELHIVERY_CANCEL_PAYLOAD_TEMPLATE']) {
      try {
        JSON.parse(process.env[name]);
      } catch {
        throw new Error(`${name} must contain valid JSON with only account-verified field mappings`);
      }
    }
  }
  if (!['lax', 'strict', 'none'].includes(getCookieSameSite())) {
    throw new Error('COOKIE_SAME_SITE must be one of: lax, strict, none');
  }
};

module.exports = { getClientOrigins, getCookieSameSite, validateEnvironment };
