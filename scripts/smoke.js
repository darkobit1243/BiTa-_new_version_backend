/* eslint-disable no-console */

// Simple end-to-end smoke test for the mock backend.
// Runs against http://localhost:8080 by default.
//
// Usage:
//   node scripts/smoke.js
//   node scripts/smoke.js --baseUrl=http://localhost:8080
//   API_BASE_URL=http://localhost:8080 node scripts/smoke.js

const DEFAULT_BASE_URL = 'http://localhost:8080';

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

async function main() {
  const baseUrl = parseBaseUrlFromArgs();
  console.log(`[smoke] baseUrl=${baseUrl}`);

  // 1) Health
  {
    const { res, json } = await getJson(baseUrl, '/health');
    assert(res.ok, `GET /health failed: HTTP ${res.status}`);
    assert(json && json.data && json.data.ok === true, 'GET /health: unexpected response');
    console.log(`[ok] GET /health users=${json.data.users} listings=${json.data.listings}`);
  }

  // 2) Register
  const registerEmail = randEmail();
  const registerBody = {
    email: registerEmail,
    password: 'pass1234',
    role: 'seeker',
    membershipType: 'basic',
    name: 'Smoke User',
  };

  let session;
  {
    const { res, json } = await postJson(baseUrl, '/auth/register', registerBody);
    assert(res.status === 201, `POST /auth/register failed: HTTP ${res.status}`);
    assert(json && json.data, 'POST /auth/register: missing data');
    session = json.data;
    assert(String(session.email).toLowerCase() === registerEmail.toLowerCase(), 'register: email mismatch');
    assert(session.userId, 'register: missing userId');
    console.log(`[ok] POST /auth/register userId=${session.userId}`);
  }

  // 3) Login
  {
    const { res, json } = await postJson(baseUrl, '/auth/login', {
      email: registerEmail,
      password: 'pass1234',
      role: 'seeker',
    });
    assert(res.ok, `POST /auth/login failed: HTTP ${res.status}`);
    assert(json && json.data && json.data.userId, 'login: missing session');
    assert(json.data.userId === session.userId, 'login: userId mismatch');
    console.log(`[ok] POST /auth/login userId=${json.data.userId}`);
  }

  // 4) Feed
  let listingId;
  {
    const { res, json, url } = await getJson(baseUrl, '/listings/feed?userRole=seeker');
    assert(res.ok, `GET /listings/feed failed: HTTP ${res.status}`);
    assert(json && Array.isArray(json.data), `feed: expected {data: []} from ${url}`);
    assert(json.data.length > 0, 'feed: expected at least 1 listing');
    listingId = String(json.data[0].id);
    assert(listingId, 'feed: listing id missing');
    console.log(`[ok] GET /listings/feed listingId=${listingId} count=${json.data.length}`);
  }

  // 5) Offers
  let offerId;
  {
    const { res, json } = await getJson(baseUrl, `/listings/${listingId}/offers`);
    assert(res.ok, `GET /listings/${listingId}/offers failed: HTTP ${res.status}`);
    assert(json && Array.isArray(json.data), 'offers: expected list');
    assert(json.data.length > 0, 'offers: expected at least 1 offer');
    offerId = Number(json.data[0].offerId || json.data[0].id);
    assert(Number.isFinite(offerId) && offerId > 0, 'offers: missing offerId');
    console.log(`[ok] GET /listings/:id/offers offerId=${offerId}`);
  }

  // 6) Unlocked offers should start empty
  {
    const { res, json } = await getJson(baseUrl, `/users/${session.userId}/unlocked-offers`);
    assert(res.ok, `GET /users/:id/unlocked-offers failed: HTTP ${res.status}`);
    assert(json && Array.isArray(json.data), 'unlocked-offers: expected list');
    assert(json.data.length === 0, `unlocked-offers: expected empty, got ${json.data.length}`);
    console.log('[ok] GET /users/:id/unlocked-offers empty');
  }

  // 7) Unlock an offer
  {
    const { res } = await postJson(baseUrl, `/users/${session.userId}/unlocked-offers`, { offerId });
    assert(res.status === 201, `POST /users/:id/unlocked-offers failed: HTTP ${res.status}`);
    console.log(`[ok] POST /users/:id/unlocked-offers offerId=${offerId}`);
  }

  // 8) Unlocked offers should include the offer
  {
    const { res, json } = await getJson(baseUrl, `/users/${session.userId}/unlocked-offers`);
    assert(res.ok, `GET /users/:id/unlocked-offers failed: HTTP ${res.status}`);
    assert(json && Array.isArray(json.data), 'unlocked-offers: expected list');
    assert(json.data.includes(offerId), 'unlocked-offers: offerId not found after unlock');
    console.log('[ok] GET /users/:id/unlocked-offers includes offerId');
  }

  console.log('[smoke] ✅ all checks passed');
}

main().catch((err) => {
  console.error('[smoke] ❌ failed');
  console.error(err);
  process.exitCode = 1;
});
