const jwt = require('jsonwebtoken');
const { getAdminToken, getAdminJwtSecret, isAdminEmail } = require('../utils/admin');

function extractBearer(req) {
  const raw = String(req.get('authorization') || '').trim();
  if (!raw) return '';
  if (raw.toLowerCase().startsWith('bearer ')) return raw.slice(7).trim();
  return raw;
}

function isTruthyEnv(v) {
  return ['1', 'true', 'yes', 'on'].includes(String(v || '').trim().toLowerCase());
}

function requireAdmin(req, res, next) {
  const token = getAdminToken();
  const jwtSecret = getAdminJwtSecret();

  const requireToken =
    String(process.env.NODE_ENV || '').trim().toLowerCase() === 'production' ||
    isTruthyEnv(process.env.REQUIRE_ADMIN_TOKEN);

  // Dev-friendly fallback: if neither static token nor JWT secret is configured, allow access.
  // In production (or when REQUIRE_ADMIN_TOKEN=true), fail closed.
  if (!token && !jwtSecret) {
    if (!requireToken) return next();
    return res.status(500).json({
      data: {
        error: 'admin_auth_not_configured',
        message: 'Set ADMIN_TOKEN or ADMIN_JWT_SECRET for admin routes in this environment',
      },
    });
  }

  const rawProvided = extractBearer(req) || String(req.get('x-admin-token') || '').trim();
  const provided = String(rawProvided).replace(/^bearer\s+/i, '').trim();

  if (!provided) {
    return res.status(401).json({
      data: {
        error: 'unauthorized',
        howToProvideToken: 'Send Authorization: Bearer <adminAccessToken|ADMIN_TOKEN> or x-admin-token: <ADMIN_TOKEN>',
      },
    });
  }

  // 1) Static admin token (legacy / simple deploy)
  if (token) {
    const expected = String(token).replace(/^bearer\s+/i, '').trim();
    if (expected && provided === expected) return next();
  }

  // 2) Admin session token (JWT) issued on login
  if (jwtSecret) {
    try {
      const payload = jwt.verify(provided, jwtSecret);
      const email = payload && payload.email ? String(payload.email) : '';
      const ok = Boolean(payload && payload.isAdmin) && email && isAdminEmail(email);
      if (ok) return next();
    } catch (_) {
      // ignore
    }
  }

  // Do not leak secrets; provide minimal diagnostics.
  return res.status(401).json({
    data: {
      error: 'unauthorized',
      hasAdminTokenConfigured: Boolean(token),
      hasAdminJwtConfigured: Boolean(jwtSecret),
      howToProvideToken: 'Send Authorization: Bearer <adminAccessToken|ADMIN_TOKEN> or x-admin-token: <ADMIN_TOKEN>',
    },
  });
}

module.exports = { requireAdmin };
