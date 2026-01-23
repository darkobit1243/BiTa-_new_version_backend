const { getAdminToken } = require('../utils/admin');

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

  const requireToken =
    String(process.env.NODE_ENV || '').trim().toLowerCase() === 'production' ||
    isTruthyEnv(process.env.REQUIRE_ADMIN_TOKEN);

  // Dev-friendly fallback: if no ADMIN_TOKEN is configured, allow access.
  // In production (or when REQUIRE_ADMIN_TOKEN=true), fail closed.
  if (!token) {
    if (!requireToken) return next();
    return res.status(500).json({
      data: {
        error: 'admin_token_not_configured',
        message: 'ADMIN_TOKEN is required for admin routes in this environment',
      },
    });
  }

  const expected = String(token).replace(/^bearer\s+/i, '').trim();
  const rawProvided = extractBearer(req) || String(req.get('x-admin-token') || '').trim();
  const provided = String(rawProvided).replace(/^bearer\s+/i, '').trim();

  if (!provided || !expected || provided !== expected) {
    // Do not leak token; provide minimal diagnostics to help config issues.
    return res.status(401).json({
      data: {
        error: 'unauthorized',
        hasAdminTokenConfigured: true,
        expectedTokenLength: expected.length,
        hasProvidedToken: Boolean(rawProvided),
        providedTokenLength: rawProvided ? String(rawProvided).trim().length : 0,
        howToProvideToken: 'Send Authorization: Bearer <ADMIN_TOKEN> or x-admin-token: <ADMIN_TOKEN>',
      },
    });
  }

  return next();
}

module.exports = { requireAdmin };
