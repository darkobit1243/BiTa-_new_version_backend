/* eslint-disable no-console */

// Simple end-to-end smoke test for the mock backend.
// Runs against http://localhost:8080 by default.
//
// Usage:
//   node scripts/smoke.js
//   node scripts/smoke.js --baseUrl=http://localhost:8080
//   API_BASE_URL=http://localhost:8080 node scripts/smoke.js

const DEFAULT_BASE_URL = 'http://localhost:8080';

const { spawn } = require('child_process');
const path = require('path');

function parseBaseUrlFromArgs() {
  const arg = process.argv.find((a) => a.startsWith('--baseUrl='));
  if (arg) return arg.split('=')[1];
  return process.env.API_BASE_URL || DEFAULT_BASE_URL;
}

function joinUrl(baseUrl, path) {
  const b = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${b}${p}`;
}

function assert(condition, message) {
  if (!condition) {
    const err = new Error(message);
    err.name = 'SmokeTestError';
    throw err;
  }
}

async function readJson(res) {
  const text = await res.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch (_) {
    return { _raw: text };
  }
}

async function httpJson(baseUrl, method, path, body) {
  const url = joinUrl(baseUrl, path);
  const res = await fetch(url, {
    method,
    headers: {
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json; charset=utf-8' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const json = await readJson(res);
  return { res, json, url };
}

async function httpJsonWithHeaders(baseUrl, method, path, body, extraHeaders) {
  const url = joinUrl(baseUrl, path);
  const res = await fetch(url, {
    method,
    headers: {
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json; charset=utf-8' } : {}),
      ...(extraHeaders || {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const json = await readJson(res);
  return { res, json, url };
}

async function getJsonWithHeaders(baseUrl, path, headers) {
  return httpJsonWithHeaders(baseUrl, 'GET', path, null, headers);
}

async function postJsonWithHeaders(baseUrl, path, body, headers) {
  return httpJsonWithHeaders(baseUrl, 'POST', path, body, headers);
}

async function waitForHealth(baseUrl, { timeoutMs = 12000, intervalMs = 500 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastErr = null;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const { res, json } = await getJson(baseUrl, '/health');
      if (res.ok && json && json.data && json.data.ok === true) return;
      lastErr = new Error(`health not ready: HTTP ${res.status}`);
    } catch (e) {
      lastErr = e;
    }

    if (Date.now() > deadline) {
      throw lastErr || new Error('health timeout');
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

async function getJson(baseUrl, path) {
  return httpJson(baseUrl, 'GET', path);
}

async function postJson(baseUrl, path, body) {
  return httpJson(baseUrl, 'POST', path, body);
}

function randEmail() {
  const stamp = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 8);
  return `smoke_${stamp}_${r}@bitasi.app`;
}

function shouldSpawnServer() {
  const v = String(process.env.SMOKE_SPAWN_SERVER || '').trim().toLowerCase();
  if (!v) return true;
  return ['1', 'true', 'yes', 'on'].includes(v);
}

function spawnLocalServer({ port = 8080 } = {}) {
  const cwd = path.join(__dirname, '..');
  const child = spawn(process.execPath, ['server.js'], {
    cwd,
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (b) => {
    stdout += b.toString();
  });
  child.stderr.on('data', (b) => {
    stderr += b.toString();
  });

  child.on('exit', (code) => {
    if (code && code !== 0) {
      console.error('[smoke] server exited early');
      if (stdout.trim()) console.error(stdout.trim());
      if (stderr.trim()) console.error(stderr.trim());
    }
  });

  return {
    child,
    getLogs: () => ({ stdout, stderr }),
  };
}

async function stopChild(child) {
  if (!child || child.killed) return;
  try {
    child.kill('SIGTERM');
  } catch (_) {
    // ignore
  }
  await new Promise((r) => setTimeout(r, 300));
  if (!child.killed) {
    try {
      child.kill('SIGKILL');
    } catch (_) {
      // ignore
    }
  }
}

async function main() {
  const baseUrl = parseBaseUrlFromArgs();
  console.log(`[smoke] baseUrl=${baseUrl}`);

  let server = null;
  if (shouldSpawnServer() && baseUrl === DEFAULT_BASE_URL) {
    server = spawnLocalServer({ port: 8080 });
  }

  try {
    await waitForHealth(baseUrl);

  // 1) Health
  {
    const { res, json } = await getJson(baseUrl, '/health');
    assert(res.ok, `GET /health failed: HTTP ${res.status}`);
    assert(json && json.data && json.data.ok === true, 'GET /health: unexpected response');
    console.log(`[ok] GET /health users=${json.data.users} listings=${json.data.listings}`);
  }

  // 2) Register
  const seekerEmail = randEmail();
  const seekerRegisterBody = {
    email: seekerEmail,
    password: 'pass1234',
    role: 'seeker',
    membershipType: 'basic',
    name: 'Smoke User',
  };

  let seekerSession;
  {
    const { res, json } = await postJson(baseUrl, '/auth/register', seekerRegisterBody);
    assert(res.status === 201, `POST /auth/register failed: HTTP ${res.status}`);
    assert(json && json.data, 'POST /auth/register: missing data');
    seekerSession = json.data;
    assert(String(seekerSession.email).toLowerCase() === seekerEmail.toLowerCase(), 'register: email mismatch');
    assert(seekerSession.userId, 'register: missing userId');
    console.log(`[ok] POST /auth/register (seeker) userId=${seekerSession.userId}`);
  }

  const providerEmail = randEmail();
  const providerRegisterBody = {
    email: providerEmail,
    password: 'pass1234',
    role: 'provider',
    membershipType: 'basic',
    name: 'Smoke Provider',
  };

  let providerSession;
  {
    const { res, json } = await postJson(baseUrl, '/auth/register', providerRegisterBody);
    assert(res.status === 201, `POST /auth/register (provider) failed: HTTP ${res.status}`);
    assert(json && json.data && json.data.userId, 'register provider: missing userId');
    providerSession = json.data;
    console.log(`[ok] POST /auth/register (provider) userId=${providerSession.userId}`);
  }

  // 3) Login
  {
    const { res, json } = await postJson(baseUrl, '/auth/login', {
      email: seekerEmail,
      password: 'pass1234',
      role: 'seeker',
    });
    assert(res.ok, `POST /auth/login failed: HTTP ${res.status}`);
    assert(json && json.data && json.data.userId, 'login: missing session');
    assert(json.data.userId === seekerSession.userId, 'login: userId mismatch');
    console.log(`[ok] POST /auth/login userId=${json.data.userId}`);
  }

  {
    const { res, json } = await postJson(baseUrl, '/auth/login', {
      email: providerEmail,
      password: 'pass1234',
      role: 'provider',
    });
    assert(res.ok, `POST /auth/login (provider) failed: HTTP ${res.status}`);
    assert(json && json.data && json.data.userId, 'login provider: missing session');
    assert(json.data.userId === providerSession.userId, 'login provider: userId mismatch');
    console.log(`[ok] POST /auth/login (provider) userId=${json.data.userId}`);
  }

  // 4) Create a listing (no demo seed assumed)
  let listingId;
  {
    const body = {
      ownerId: String(seekerSession.userId),
      ownerRole: 'seeker',
      title: 'Smoke Listing',
      adType: 'transport',
      serviceType: 'vehicle',
      originCityName: 'İstanbul',
      destinationCityName: 'Ankara',
      date: new Date().toISOString(),
      cargoType: 'Koli',
      weight: '100',
      isBoosted: false,
      notes: 'smoke',
    };
    const { res, json } = await postJson(baseUrl, '/listings', body);
    assert(res.status === 201, `POST /listings failed: HTTP ${res.status}`);
    assert(json && json.data && json.data.id, 'create listing: missing id');
    listingId = String(json.data.id);
    console.log(`[ok] POST /listings listingId=${listingId}`);
  }

  // 5) Feed should include listing (or at least be reachable)
  {
    const { res, json, url } = await getJson(baseUrl, '/listings/feed?userRole=seeker');
    assert(res.ok, `GET /listings/feed failed: HTTP ${res.status}`);
    assert(json && Array.isArray(json.data), `feed: expected {data: []} from ${url}`);
    const found = json.data.some((l) => String(l.id) === listingId);
    assert(found, 'feed: created listing not found');
    console.log(`[ok] GET /listings/feed contains listingId=${listingId}`);
  }

  // 6) Provider submits an offer (requires x-user-id)
  let offerId;
  {
    const { res, json } = await postJsonWithHeaders(
      baseUrl,
      `/listings/${listingId}/offers`,
      {
        companyName: 'Smoke Logistics',
        price: 12345,
        phone: '+90 555 000 0000',
        email: providerEmail,
        providerCity: 'İzmir',
      },
      { 'x-user-id': String(providerSession.userId) },
    );
    assert(res.status === 201, `POST /listings/:id/offers failed: HTTP ${res.status}`);
    assert(json && json.data && (json.data.offerId || json.data.id), 'create offer: missing offerId');
    offerId = Number(json.data.offerId || json.data.id);
    assert(Number.isFinite(offerId) && offerId > 0, 'create offer: invalid offerId');
    console.log(`[ok] POST /listings/:id/offers offerId=${offerId}`);
  }

  // 7) Offers are owner-only (missing x-user-id should fail)
  {
    const { res } = await getJson(baseUrl, `/listings/${listingId}/offers`);
    assert(res.status === 400 || res.status === 403, `owner-only offers: expected 400/403, got ${res.status}`);
    console.log('[ok] GET /listings/:id/offers requires user context');
  }

  // 8) Owner fetches offers (allowed) (may have redacted contact until accept)
  {
    const { res, json } = await getJsonWithHeaders(baseUrl, `/listings/${listingId}/offers`, {
      'x-user-id': String(seekerSession.userId),
    });
    assert(res.ok, `GET /listings/:id/offers (owner) failed: HTTP ${res.status}`);
    assert(json && Array.isArray(json.data), 'offers (owner): expected list');
    assert(json.data.length === 1, `offers (owner): expected 1 offer, got ${json.data.length}`);
    console.log('[ok] GET /listings/:id/offers (owner) returned 1 offer');
  }

  // 9) Unlocked offers should start empty (seeker)
  {
    const { res, json } = await getJson(baseUrl, `/users/${seekerSession.userId}/unlocked-offers`);
    assert(res.ok, `GET /users/:id/unlocked-offers failed: HTTP ${res.status}`);
    assert(json && Array.isArray(json.data), 'unlocked-offers: expected list');
    assert(json.data.length === 0, `unlocked-offers: expected empty, got ${json.data.length}`);
    console.log('[ok] GET /users/:id/unlocked-offers empty');
  }

  // 10) Owner accepts offer -> unlocks contact for both parties (payment bypass)
  {
    const { res, json } = await postJsonWithHeaders(
      baseUrl,
      `/listings/${listingId}/offers/${offerId}/accept`,
      {},
      { 'x-user-id': String(seekerSession.userId) },
    );
    assert(res.status === 201, `POST /listings/:id/offers/:offerId/accept failed: HTTP ${res.status}`);
    assert(json && json.data && json.data.ok === true, 'accept offer: unexpected response');
    console.log('[ok] POST /listings/:id/offers/:offerId/accept');
  }

  // 11) Both parties should now have offerId in unlocked-offers
  {
    const { res, json } = await getJson(baseUrl, `/users/${seekerSession.userId}/unlocked-offers`);
    assert(res.ok, `GET /users/:id/unlocked-offers failed: HTTP ${res.status}`);
    assert(json && Array.isArray(json.data), 'unlocked-offers seeker: expected list');
    assert(json.data.includes(offerId), 'unlocked-offers seeker: offerId missing after accept');
    console.log('[ok] seeker unlocked-offers includes offerId');
  }

  {
    const { res, json } = await getJson(baseUrl, `/users/${providerSession.userId}/unlocked-offers`);
    assert(res.ok, `GET /users/:id/unlocked-offers (provider) failed: HTTP ${res.status}`);
    assert(json && Array.isArray(json.data), 'unlocked-offers provider: expected list');
    assert(json.data.includes(offerId), 'unlocked-offers provider: offerId missing after accept');
    console.log('[ok] provider unlocked-offers includes offerId');
  }

  // 12) Provider accepted offers should include owner contact (if unlocked)
  {
    const { res, json } = await getJson(baseUrl, `/users/${providerSession.userId}/accepted-offers`);
    assert(res.ok, `GET /users/:id/accepted-offers failed: HTTP ${res.status}`);
    assert(json && Array.isArray(json.data), 'accepted-offers: expected list');
    assert(json.data.length >= 1, 'accepted-offers: expected at least 1 item');
    const entry = json.data.find((x) => x && x.offer && Number(x.offer.offerId || x.offer.id) === offerId);
    assert(entry, 'accepted-offers: expected accepted offer entry');
    assert(entry.offer && String(entry.offer.status).toLowerCase() === 'accepted', 'accepted-offers: status not accepted');
    assert(entry.offer && entry.offer.isUnlocked === true, 'accepted-offers: offer not unlocked');
    assert(entry.owner && entry.owner.email, 'accepted-offers: missing owner contact');
    console.log('[ok] GET /users/:id/accepted-offers includes owner contact');
  }

  // 13) Owner fetching offers should now see provider contact unlocked
  {
    const { res, json } = await getJsonWithHeaders(baseUrl, `/listings/${listingId}/offers`, {
      'x-user-id': String(seekerSession.userId),
    });
    assert(res.ok, `GET /listings/:id/offers (owner) failed: HTTP ${res.status}`);
    assert(json && Array.isArray(json.data) && json.data.length === 1, 'offers (owner) after accept: expected 1');
    const o = json.data[0];
    assert(o && o.isUnlocked === true, 'offers (owner) after accept: expected isUnlocked=true');
    assert(o && o.phone, 'offers (owner) after accept: expected provider phone');
    assert(o && o.email, 'offers (owner) after accept: expected provider email');
    console.log('[ok] GET /listings/:id/offers shows provider contact after accept');
  }

    console.log('[smoke] ✅ all checks passed');
  } finally {
    if (server && server.child) {
      await stopChild(server.child);
    }
  }
}

main().catch((err) => {
  console.error('[smoke] ❌ failed');
  console.error(err);
  process.exitCode = 1;
});
