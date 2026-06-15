const {
  calculateRestaurantOrderTotals,
  documentData,
  error,
  firestore,
  json,
  kitchenTicketsForQrOrder,
  options,
} = require('./_firebase-admin.cjs');

function cleanString(value) {
  return String(value || '').trim();
}

function normalizeQuantity(value) {
  const quantity = Number(value || 0);
  if (!Number.isFinite(quantity)) return 0;
  return Math.max(0, Math.min(99, Math.floor(quantity)));
}

function orderNumber() {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `OD-${datePart}-${String(Date.now()).slice(-4)}`;
}

async function findTable(db, tableId) {
  const byId = documentData(await db.collection('tables').doc(tableId).get());
  if (byId) return byId;

  const byLabel = await db.collection('tables').where('label', '==', tableId).limit(1).get();
  if (!byLabel.empty) return documentData(byLabel.docs[0]);

  return null;
}

exports.handler = async event => {
  if (event.httpMethod === 'OPTIONS') return options();
  if (event.httpMethod !== 'POST') return error(405, 'Method not allowed.');

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return error(400, 'Invalid JSON payload.');
  }

  const tableId = cleanString(payload.tableId);
  const guestName = cleanString(payload.guestName);
  const guestPhone = cleanString(payload.guestPhone);
  const requestedItems = Array.isArray(payload.items) ? payload.items : [];

  if (!tableId) return error(400, 'Missing tableId.');
  if (!guestName) return error(400, 'Guest name is required.');
  if (!guestPhone) return error(400, 'Guest mobile number is required.');
  if (!requestedItems.length) return error(400, 'Please add at least one item.');

  try {
    const db = firestore();
    const table = await findTable(db, tableId);
    if (!table) return error(404, 'Table not found.');

    const itemIds = [...new Set(requestedItems.map(item => cleanString(item.menuItemId)).filter(Boolean))];
    const menuSnapshots = await Promise.all(itemIds.map(id => db.collection('menuItems').doc(id).get()));
    const menuItemsById = new Map(
      menuSnapshots
        .map(documentData)
        .filter(item => item && item.active !== false)
        .filter(item => !Array.isArray(item.branchIds) || item.branchIds.length === 0 || item.branchIds.includes(table.branchId))
        .map(item => [item.id, item])
    );

    const now = Date.now();
    const orderItems = requestedItems
      .map((item, index) => {
        const menuItemId = cleanString(item.menuItemId);
        const menuItem = menuItemsById.get(menuItemId);
        const quantity = normalizeQuantity(item.quantity);
        if (!menuItem || quantity <= 0) return null;
        const spiceLevel = cleanString(item.spiceLevel);
        const itemNote = cleanString(item.note);
        return {
          id: `QRI-${menuItem.id}-${now}-${index}`,
          menuItemId: menuItem.id,
          nameEn: menuItem.nameEn,
          nameAr: menuItem.nameAr,
          quantity,
          unitPrice: Number(menuItem.basePrice || 0),
          modifiers: [],
          station: menuItem.station || 'general',
          note: [spiceLevel && spiceLevel !== 'regular' ? `Spice: ${spiceLevel}` : '', itemNote].filter(Boolean).join(' / ') || undefined,
          status: 'fired',
          firedAt: now,
        };
      })
      .filter(Boolean);

    if (!orderItems.length) return error(400, 'No available menu items were found for this order.');

    const totals = calculateRestaurantOrderTotals(orderItems, 0, Number(payload.vatRate || 0.15));
    const order = {
      id: `ORD-QR-${now}`,
      branchId: table.branchId,
      orderNumber: orderNumber(),
      orderType: 'qr_order',
      status: 'fired',
      tableId: table.id,
      tableLabel: table.label,
      channel: 'qr',
      items: orderItems,
      subtotal: totals.subtotal,
      discount: totals.discount,
      vat: totals.vat,
      total: totals.total,
      createdAt: now,
      updatedAt: now,
      note: [`Guest: ${guestName}`, `Mobile: ${guestPhone}`, cleanString(payload.note)].filter(Boolean).join(' / '),
    };
    const tickets = kitchenTicketsForQrOrder(order);

    const batch = db.batch();
    batch.set(db.collection('restaurantOrders').doc(order.id), order, { merge: true });
    tickets.forEach(ticket => {
      batch.set(db.collection('kitchenTickets').doc(ticket.id), ticket, { merge: true });
    });
    batch.set(db.collection('tables').doc(table.id), { state: 'ordering', activeOrderId: order.id, updatedAt: now }, { merge: true });
    await batch.commit();

    return json(200, { ok: true, data: order });
  } catch (err) {
    console.error('QR order failed', err);
    return error(500, err instanceof Error ? err.message : 'QR order failed.');
  }
};
