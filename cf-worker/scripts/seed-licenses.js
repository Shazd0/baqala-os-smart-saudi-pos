/**
 * Seed Baqala OS licenses into Cloudflare KV.
 * Usage: CLOUDFLARE_API_TOKEN=<token> ACCOUNT_ID=<id> KV_NAMESPACE_ID=<id> node seed-licenses.js
 *
 * Generates licenses BQL-SA-0001 … BQL-SA-0200 and upserts them into the LICENSES KV namespace.
 */

const CHARS = 'ABCDEFGHJKLMNPQRSTVWXYZ23456789'; // no ambiguous chars

function randomKey(len = 12) {
  let k = '';
  const arr = new Uint8Array(len);
  // In Node.js < 19, crypto.getRandomValues is not available; use crypto.randomFillSync
  require('crypto').randomFillSync(arr);
  for (const b of arr) k += CHARS[b % CHARS.length];
  return k;
}

async function main() {
  const { CLOUDFLARE_API_TOKEN, ACCOUNT_ID, KV_NAMESPACE_ID } = process.env;
  if (!CLOUDFLARE_API_TOKEN || !ACCOUNT_ID || !KV_NAMESPACE_ID) {
    console.error('Set CLOUDFLARE_API_TOKEN, ACCOUNT_ID, and KV_NAMESPACE_ID env vars.');
    process.exit(1);
  }

  const count = parseInt(process.argv[2] || '200', 10);
  const licenses = [];

  for (let i = 1; i <= count; i++) {
    const licenseId = `BQL-SA-${String(i).padStart(4, '0')}`;
    const key = randomKey(12);
    licenses.push({
      licenseId,
      key,
      plan: 'standard',
      storeName: '',
      contactName: '',
      contactPhone: '',
      createdAt: Date.now(),
      activatedAt: null,
      expiresAt: null,
      revoked: false,
      machineId: null,
      allowMultiDevice: false,
      activationCount: 0,
      lastSeenAt: null,
    });
  }

  // Bulk write using KV REST API (max 10,000 per request)
  const BATCH = 100;
  for (let i = 0; i < licenses.length; i += BATCH) {
    const chunk = licenses.slice(i, i + BATCH);
    const body = chunk.map(l => ({ key: l.licenseId, value: JSON.stringify(l) }));
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/storage/kv/namespaces/${KV_NAMESPACE_ID}/bulk`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${CLOUDFLARE_API_TOKEN}` },
        body: JSON.stringify(body),
      }
    );
    const data = await res.json();
    if (!data.success) { console.error('KV write failed:', JSON.stringify(data)); process.exit(1); }
    console.log(`✓ Seeded licenses ${i + 1}–${Math.min(i + BATCH, licenses.length)}`);
  }

  // Print the generated keys
  console.log('\nGenerated license keys:');
  licenses.forEach(l => {
    const fmt = `${l.key.slice(0,4)}-${l.key.slice(4,8)}-${l.key.slice(8,12)}`;
    console.log(`${l.licenseId}  ${fmt}`);
  });
  console.log(`\nDone. ${licenses.length} licenses written to KV namespace ${KV_NAMESPACE_ID}`);
}

main().catch(console.error);
