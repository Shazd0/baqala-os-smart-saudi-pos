const { documentData, error, firestore, json, options } = require('./_firebase-admin.cjs');

async function findTable(db, tableId) {
  const byId = documentData(await db.collection('tables').doc(tableId).get());
  if (byId) return byId;

  const byLabel = await db.collection('tables').where('label', '==', tableId).limit(1).get();
  if (!byLabel.empty) return documentData(byLabel.docs[0]);

  return null;
}

exports.handler = async event => {
  if (event.httpMethod === 'OPTIONS') return options();
  if (event.httpMethod !== 'GET') return error(405, 'Method not allowed.');

  const tableId = event.queryStringParameters?.tableId?.trim();
  if (!tableId) return error(400, 'Missing tableId.');

  try {
    const db = firestore();
    const table = await findTable(db, tableId);
    if (!table) return error(404, 'Table not found.');

    const [branchesSnapshot, categoriesSnapshot, menuItemsSnapshot, configSnapshot] = await Promise.all([
      table.branchId ? db.collection('branches').doc(table.branchId).get() : Promise.resolve(null),
      db.collection('menuCategories').get(),
      db.collection('menuItems').get(),
      db.collection('storeConfig').doc('default').get(),
    ]);

    const branch = branchesSnapshot ? documentData(branchesSnapshot) : null;
    const categories = categoriesSnapshot.docs
      .map(documentData)
      .filter(item => item && item.active !== false)
      .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0));
    const menuItems = menuItemsSnapshot.docs
      .map(documentData)
      .filter(item => item && item.active !== false)
      .filter(item => !Array.isArray(item.branchIds) || item.branchIds.length === 0 || item.branchIds.includes(table.branchId));
    const config = documentData(configSnapshot);

    return json(200, {
      ok: true,
      data: {
        table,
        branch,
        categories,
        menuItems,
        vatRate: Number(config?.vatRate || 0.15),
      },
    });
  } catch (err) {
    console.error('QR bootstrap failed', err);
    return error(500, err instanceof Error ? err.message : 'QR bootstrap failed.');
  }
};
