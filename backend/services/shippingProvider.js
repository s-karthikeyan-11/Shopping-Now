const crypto = require('crypto');

const providerName = () => (process.env.SHIPPING_PROVIDER || (process.env.NODE_ENV === 'production' ? 'delhivery' : 'mock')).toLowerCase();

const requiredDelhiverySettings = [
  'DELHIVERY_API_TOKEN',
  'DELHIVERY_AUTH_HEADER',
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

const isConfigured = () => providerName() === 'mock'
  || (providerName() === 'delhivery' && requiredDelhiverySettings.every((name) => Boolean(process.env[name])));

const lookup = (value, path) => {
  if (!path) return undefined;
  return path.split('.').reduce((current, part) => {
    if (current == null) return undefined;
    return /^\d+$/.test(part) ? current[Number(part)] : current[part];
  }, value);
};

const renderTemplate = (templateText, context) => {
  let template;
  try {
    template = JSON.parse(templateText);
  } catch {
    throw Object.assign(new Error('Configured Delhivery payload template is not valid JSON'), { status: 503 });
  }

  const renderValue = (value) => {
    if (Array.isArray(value)) return value.map(renderValue);
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, renderValue(nested)]));
    }
    if (typeof value !== 'string') return value;
    const exact = value.match(/^\{\{([A-Za-z0-9_.]+)\}\}$/);
    if (exact) return lookup(context, exact[1]);
    return value.replace(/\{\{([A-Za-z0-9_.]+)\}\}/g, (match, path) => {
      const resolved = lookup(context, path);
      return resolved == null ? '' : String(resolved);
    });
  };
  return renderValue(template);
};

const requestDelhivery = async (url, { method = 'GET', body } = {}) => {
  if (!isConfigured() || providerName() !== 'delhivery') {
    throw Object.assign(new Error('Delhivery API is not configured'), { status: 503 });
  }
  const authHeader = process.env.DELHIVERY_AUTH_HEADER;
  const authPrefix = process.env.DELHIVERY_AUTH_VALUE_PREFIX || '';
  const headers = {
    Accept: 'application/json',
    [authHeader]: `${authPrefix ? `${authPrefix} ` : ''}${process.env.DELHIVERY_API_TOKEN}`,
    ...(body ? { 'Content-Type': 'application/json' } : {}),
  };
  const response = await fetch(url, {
    method,
    headers,
    signal: AbortSignal.timeout(20000),
    ...(body && !['GET', 'HEAD'].includes(method.toUpperCase()) ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw Object.assign(new Error('Delhivery returned a non-JSON response'), { status: 502 });
  }
  if (!response.ok) {
    throw Object.assign(new Error(`Delhivery request failed with HTTP ${response.status}`), { status: 502 });
  }
  return data;
};

const getOrderContext = (order, items = order.items || []) => ({
  order: {
    id: String(order._id),
    totalAmount: Number(order.totalAmount || 0),
    items: items.map((item) => ({
      productId: String(item.product),
      name: item.name,
      quantity: Number(item.quantity || 0),
      lineTotal: Number(item.lineTotal || 0),
    })),
    shippingAddress: order.shippingAddress || {},
  },
  customer: {
    name: order.user?.name || '',
    email: order.user?.email || '',
    phone: order.shippingAddress?.phone || '',
  },
});

const normalizeEvents = (response) => {
  const events = lookup(response, process.env.DELHIVERY_TRACKING_EVENTS_PATH) || [];
  if (!Array.isArray(events)) return [];
  return events.map((event) => {
    const dateValue = new Date(lookup(event, process.env.DELHIVERY_EVENT_TIME_PATH));
    return {
      status: String(lookup(event, process.env.DELHIVERY_EVENT_STATUS_PATH) || 'Update'),
      createdAt: Number.isNaN(dateValue.getTime()) ? new Date() : dateValue,
      ...(process.env.DELHIVERY_EVENT_LOCATION_PATH ? { location: String(lookup(event, process.env.DELHIVERY_EVENT_LOCATION_PATH) || '') } : {}),
      ...(process.env.DELHIVERY_EVENT_DESCRIPTION_PATH ? { description: String(lookup(event, process.env.DELHIVERY_EVENT_DESCRIPTION_PATH) || '') } : {}),
    };
  });
};

const mockShipment = (direction) => ({
  provider: 'mock-delhivery',
  providerShipmentId: `mock_${crypto.randomUUID()}`,
  trackingNumber: `MOCK${Date.now().toString().slice(-10)}`,
  status: direction === 'reverse' ? 'Pickup scheduled' : 'Shipment created',
  events: [{ status: direction === 'reverse' ? 'Pickup scheduled' : 'Shipment created', createdAt: new Date() }],
});

const createShipment = async (order, direction = 'forward', items = order.items || []) => {
  if (!isConfigured()) throw Object.assign(new Error('Shipping provider is not configured'), { status: 503 });
  if (providerName() === 'mock') return mockShipment(direction);

  const isReverse = direction === 'reverse';
  const url = isReverse ? process.env.DELHIVERY_CREATE_REVERSE_PICKUP_URL : process.env.DELHIVERY_CREATE_SHIPMENT_URL;
  const template = isReverse ? process.env.DELHIVERY_REVERSE_PICKUP_PAYLOAD_TEMPLATE : process.env.DELHIVERY_SHIPMENT_PAYLOAD_TEMPLATE;
  const context = getOrderContext(order, items);
  const method = isReverse ? process.env.DELHIVERY_CREATE_REVERSE_PICKUP_METHOD : process.env.DELHIVERY_CREATE_SHIPMENT_METHOD;
  const response = await requestDelhivery(url, { method, body: renderTemplate(template, context) });
  const shipmentId = lookup(response, process.env.DELHIVERY_SHIPMENT_ID_PATH);
  const trackingNumber = lookup(response, process.env.DELHIVERY_TRACKING_NUMBER_PATH);
  if (!shipmentId || !trackingNumber) {
    throw Object.assign(new Error('Delhivery response mapping did not produce a shipment ID and tracking number'), { status: 502 });
  }
  return {
    provider: 'delhivery',
    providerShipmentId: String(shipmentId),
    trackingNumber: String(trackingNumber),
    status: String(lookup(response, process.env.DELHIVERY_TRACKING_STATUS_PATH) || 'Shipment created'),
    events: normalizeEvents(response),
  };
};

const trackShipment = async (order, shipment, direction = 'forward', items = order.items || []) => {
  if (!isConfigured()) throw Object.assign(new Error('Shipping provider is not configured'), { status: 503 });
  if (shipment.provider === 'mock-delhivery') {
    return { ...shipment, events: shipment.events || [] };
  }
  const url = process.env.DELHIVERY_TRACKING_URL_TEMPLATE
    .replace(/\{\{trackingNumber\}\}/g, encodeURIComponent(shipment.trackingNumber))
    .replace(/\{\{shipmentId\}\}/g, encodeURIComponent(shipment.providerShipmentId || ''))
    .replace(/\{\{orderId\}\}/g, encodeURIComponent(String(order._id)))
    .replace(/\{\{direction\}\}/g, direction);
  const response = await requestDelhivery(url, { method: process.env.DELHIVERY_TRACKING_METHOD || 'GET' });
  const events = normalizeEvents(response);
  return {
    ...shipment,
    status: String(lookup(response, process.env.DELHIVERY_TRACKING_STATUS_PATH) || shipment.status),
    events: events.length ? events : shipment.events || [],
  };
};

const cancelShipment = async (order, shipment, direction = 'forward', items = order.items || []) => {
  if (!isConfigured()) throw Object.assign(new Error('Shipping provider is not configured'), { status: 503 });
  if (shipment.provider === 'mock-delhivery') {
    return {
      ...shipment,
      status: 'Cancelled',
      events: [...(shipment.events || []), { status: 'Shipment cancelled', createdAt: new Date() }],
    };
  }
  const urlTemplate = direction === 'reverse'
    ? process.env.DELHIVERY_CANCEL_REVERSE_PICKUP_URL_TEMPLATE
    : process.env.DELHIVERY_CANCEL_SHIPMENT_URL_TEMPLATE;
  const url = urlTemplate
    .replace(/\{\{trackingNumber\}\}/g, encodeURIComponent(shipment.trackingNumber))
    .replace(/\{\{shipmentId\}\}/g, encodeURIComponent(shipment.providerShipmentId || ''))
    .replace(/\{\{orderId\}\}/g, encodeURIComponent(String(order._id)))
    .replace(/\{\{direction\}\}/g, direction);
  const context = { ...getOrderContext(order, items), shipment: { ...shipment }, direction };
  const method = direction === 'reverse'
    ? process.env.DELHIVERY_CANCEL_REVERSE_PICKUP_METHOD
    : process.env.DELHIVERY_CANCEL_SHIPMENT_METHOD;
  const response = await requestDelhivery(url, {
    method,
    body: renderTemplate(process.env.DELHIVERY_CANCEL_PAYLOAD_TEMPLATE, context),
  });
  return {
    ...shipment,
    status: String(lookup(response, process.env.DELHIVERY_TRACKING_STATUS_PATH) || 'Cancellation requested'),
    events: [...normalizeEvents(response), { status: 'Cancellation requested', createdAt: new Date() }],
  };
};

module.exports = { cancelShipment, createShipment, isConfigured, providerName, trackShipment };
