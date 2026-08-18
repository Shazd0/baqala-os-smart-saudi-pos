/**
 * Baqala OS — License Validation API
 * Deployed as a Cloudflare Worker.
 *
 * KV Namespaces:
 *   LICENSES  — key: licenseId (e.g. "BQL-SA-0001"), value: JSON LicenseRecord
 *   TRIALS    — key: trialId   (e.g. "TRIAL-ABCDEF123456"), value: JSON TrialRecord
 *
 * Secrets (set with `wrangler secret put`):
 *   ADMIN_TOKEN — bearer token for admin endpoints
 *
 * Endpoints:
 *   POST /activate         — validate + bind license
 *   POST /trial            — start / resume 14-day trial
 *   POST /heartbeat        — periodic check (refresh lease)
 *   GET  /admin/licenses   — list all licenses (admin)
 *   POST /admin/license    — create a license (admin)
 *   POST /admin/revoke     — revoke a license (admin)
 *   POST /admin/reset      — clear machine binding (admin)
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

function requireAdmin(request, env) {
  const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  return token === env.ADMIN_TOKEN;
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // ── POST /activate ─────────────────────────────────────────────────────
      if (path === '/activate' && request.method === 'POST') {
        const { licenseId, licenseKey, machineId, appVersion } = await request.json();
        if (!licenseId || !licenseKey || !machineId) return json({ error: 'Missing fields.' }, 400);

        const record = await env.LICENSES.get(licenseId.toUpperCase(), 'json');
        if (!record) return json({ error: 'License ID not found.' }, 404);
        if (record.key !== licenseKey.toUpperCase().replace(/-/g, '')) {
          return json({ error: 'Invalid license key.' }, 401);
        }
        if (record.revoked) {
          return json({ error: 'This license has been deactivated. Contact support on WhatsApp: +966 570 030 313.' }, 403);
        }
        if (record.expiresAt && Date.now() > record.expiresAt) {
          return json({ error: 'License has expired. Please renew your subscription.' }, 402);
        }

        // Machine binding: allow re-activation on same machine, block on different
        if (record.machineId && record.machineId !== machineId) {
          if (!record.allowMultiDevice) {
            return json({ error: 'This license is already active on another device. Contact support to transfer.' }, 409);
          }
        }

        // Update record
        record.machineId = machineId;
        record.lastSeenAt = Date.now();
        record.lastAppVersion = appVersion || '';
        record.activationCount = (record.activationCount || 0) + 1;
        await env.LICENSES.put(licenseId.toUpperCase(), JSON.stringify(record));

        return json({
          lease: {
            licenseId: record.licenseId,
            activatedAt: record.activatedAt || Date.now(),
            expiresAt: record.expiresAt || null,
            plan: record.plan,
            machineId,
            storeName: record.storeName || '',
          },
        });
      }

      // ── POST /trial ─────────────────────────────────────────────────────────
      if (path === '/trial' && request.method === 'POST') {
        const { machineId, appVersion } = await request.json();
        if (!machineId) return json({ error: 'Missing machineId.' }, 400);

        const trialKey = `TRIAL-${machineId.slice(0, 16).toUpperCase()}`;
        const existing = await env.TRIALS.get(trialKey, 'json');

        if (existing) {
          if (Date.now() > existing.expiresAt) {
            return json({ error: 'Your 14-day free trial has expired. Please purchase a license.' }, 402);
          }
          return json({ lease: existing });
        }

        const trial = {
          licenseId: trialKey,
          activatedAt: Date.now(),
          expiresAt: Date.now() + 14 * 86_400_000,
          plan: 'trial',
          machineId,
          appVersion: appVersion || '',
        };
        await env.TRIALS.put(trialKey, JSON.stringify(trial));
        return json({ lease: trial });
      }

      // ── POST /heartbeat ─────────────────────────────────────────────────────
      if (path === '/heartbeat' && request.method === 'POST') {
        const { licenseId, machineId } = await request.json();
        if (!licenseId || !machineId) return json({ error: 'Missing fields.' }, 400);

        // Check trial
        if (licenseId.startsWith('TRIAL-')) {
          const trial = await env.TRIALS.get(licenseId, 'json');
          if (!trial) return json({ error: 'Trial not found.' }, 404);
          if (Date.now() > trial.expiresAt) return json({ error: 'Trial expired.' }, 402);
          return json({ valid: true, expiresAt: trial.expiresAt, plan: 'trial' });
        }

        // Check license
        const record = await env.LICENSES.get(licenseId.toUpperCase(), 'json');
        if (!record) return json({ error: 'License not found.' }, 404);
        if (record.revoked) return json({ error: 'License revoked.' }, 403);
        if (record.expiresAt && Date.now() > record.expiresAt) return json({ error: 'License expired.' }, 402);
        record.lastSeenAt = Date.now();
        await env.LICENSES.put(licenseId.toUpperCase(), JSON.stringify(record));
        return json({ valid: true, expiresAt: record.expiresAt || null, plan: record.plan });
      }

      // ── Admin: GET /admin/licenses ──────────────────────────────────────────
      if (path === '/admin/licenses' && request.method === 'GET') {
        if (!requireAdmin(request, env)) return json({ error: 'Unauthorized.' }, 401);
        const list = await env.LICENSES.list();
        const records = await Promise.all(
          list.keys.map(k => env.LICENSES.get(k.name, 'json'))
        );
        const trialList = await env.TRIALS.list();
        const trials = await Promise.all(
          trialList.keys.map(k => env.TRIALS.get(k.name, 'json'))
        );
        return json({ licenses: records.filter(Boolean), trials: trials.filter(Boolean) });
      }

      // ── Admin: POST /admin/license (create) ─────────────────────────────────
      if (path === '/admin/license' && request.method === 'POST') {
        if (!requireAdmin(request, env)) return json({ error: 'Unauthorized.' }, 401);
        const body = await request.json();
        const licenseId = (body.licenseId || '').toUpperCase();
        const licenseKey = (body.licenseKey || '').replace(/-/g, '').toUpperCase();
        if (!licenseId || !licenseKey) return json({ error: 'licenseId and licenseKey are required.' }, 400);
        const record = {
          licenseId,
          key: licenseKey,
          plan: body.plan || 'standard',
          storeName: body.storeName || '',
          contactName: body.contactName || '',
          contactPhone: body.contactPhone || '',
          createdAt: Date.now(),
          activatedAt: null,
          expiresAt: body.expiresAt || null,
          revoked: false,
          machineId: null,
          allowMultiDevice: body.allowMultiDevice || false,
          activationCount: 0,
          lastSeenAt: null,
        };
        await env.LICENSES.put(licenseId, JSON.stringify(record));
        return json({ ok: true, record });
      }

      // ── Admin: POST /admin/revoke ────────────────────────────────────────────
      if (path === '/admin/revoke' && request.method === 'POST') {
        if (!requireAdmin(request, env)) return json({ error: 'Unauthorized.' }, 401);
        const { licenseId } = await request.json();
        const record = await env.LICENSES.get(licenseId.toUpperCase(), 'json');
        if (!record) return json({ error: 'Not found.' }, 404);
        record.revoked = true;
        await env.LICENSES.put(licenseId.toUpperCase(), JSON.stringify(record));
        return json({ ok: true });
      }

      // ── Admin: POST /admin/reset (clear machine binding) ────────────────────
      if (path === '/admin/reset' && request.method === 'POST') {
        if (!requireAdmin(request, env)) return json({ error: 'Unauthorized.' }, 401);
        const { licenseId } = await request.json();
        const record = await env.LICENSES.get(licenseId.toUpperCase(), 'json');
        if (!record) return json({ error: 'Not found.' }, 404);
        record.machineId = null;
        record.revoked = false;
        await env.LICENSES.put(licenseId.toUpperCase(), JSON.stringify(record));
        return json({ ok: true });
      }

      return json({ error: 'Not found.' }, 404);
    } catch (err) {
      return json({ error: 'Internal error: ' + err.message }, 500);
    }
  },
};
