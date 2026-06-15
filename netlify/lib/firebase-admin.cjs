const admin = require('firebase-admin');

function parseServiceAccount(value) {
  if (!value) return null;
  const parsed = JSON.parse(value);
  if (parsed.private_key) {
    parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
  }
  return parsed;
}

function firebaseProjectId() {
  return process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID;
}

function firebaseCredential() {
  const serviceAccountJson =
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON ||
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON ||
    process.env.NETLIFY_FIREBASE_SERVICE_ACCOUNT;

  if (serviceAccountJson) {
    return admin.credential.cert(parseServiceAccount(serviceAccountJson));
  }

  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  const projectId = firebaseProjectId();
  if (projectId && clientEmail && privateKey) {
    return admin.credential.cert({ projectId, clientEmail, privateKey });
  }

  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return admin.credential.applicationDefault();
  }

  throw new Error(
    'Firebase Admin credentials are not configured. Set FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY.'
  );
}

function firestore() {
  if (!admin.apps.length) {
    const projectId = firebaseProjectId();
    admin.initializeApp({
      credential: firebaseCredential(),
      ...(projectId ? { projectId } : {}),
    });
  }
  return admin.firestore();
}

function documentData(snapshot) {
  if (!snapshot.exists) return null;
  return { id: snapshot.id, ...snapshot.data() };
}

function json(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  };
}

function options() {
  return json(204, {});
}

function error(statusCode, message) {
  return json(statusCode, { ok: false, error: message });
}

function roundMoney(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function orderItemUnitTotal(item) {
  const modifiers = Array.isArray(item.modifiers) ? item.modifiers : [];
  return roundMoney(Number(item.unitPrice || 0) + modifiers.reduce((sum, modifier) => sum + Number(modifier.priceDelta || 0), 0));
}

function calculateRestaurantOrderTotals(items, discount = 0, vatRate = 0.15) {
  const gross = items.reduce((sum, item) => sum + orderItemUnitTotal(item) * Number(item.quantity || 0), 0);
  const boundedDiscount = Math.min(Math.max(Number(discount || 0), 0), gross);
  const total = gross - boundedDiscount;
  const subtotal = total / (1 + Number(vatRate || 0));
  const vat = total - subtotal;

  return {
    subtotal: roundMoney(subtotal),
    discount: roundMoney(boundedDiscount),
    vat: roundMoney(vat),
    total: roundMoney(total),
  };
}

function kitchenTicketsForQrOrder(order) {
  const byStation = new Map();
  order.items
    .filter(item => item.status === 'fired')
    .forEach(item => {
      const stationItems = byStation.get(item.station) || [];
      stationItems.push(item);
      byStation.set(item.station, stationItems);
    });

  return [...byStation.entries()].map(([station, items]) => ({
    id: `KOT-${order.id}-${station}`,
    branchId: order.branchId,
    orderId: order.id,
    orderNumber: order.orderNumber,
    station,
    tableLabel: order.tableLabel,
    status: 'new',
    items: items.map(item => ({
      orderItemId: item.id,
      nameEn: item.nameEn,
      nameAr: item.nameAr,
      quantity: item.quantity,
      modifiers: item.modifiers,
      note: item.note,
    })),
    firedAt: Date.now(),
    dueAt: Date.now() + 12 * 60 * 1000,
    source: order.orderType,
  }));
}

module.exports = {
  calculateRestaurantOrderTotals,
  documentData,
  error,
  firestore,
  json,
  kitchenTicketsForQrOrder,
  options,
};
