const { getAdminToken } = require('../utils/admin');

function extractBearer(req) {
  const raw = String(req.get('authorization') || '').trim();
  if (!raw) return '';
  if (raw.toLowerCase().startsWith('bearer ')) return raw.slice(7).trim();
  return raw;
}

function requireAdmin(req, res, next) {
  const token = getAdminToken();
  // Dev-friendly fallback: if no ADMIN_TOKEN is configured, allow access.
  // In production, set ADMIN_TOKEN and use it in the admin panel settings.
  if (!token) return next();

  const expected = String(token).replace(/^bearer\s+/i, '').trim();
  const rawProvided = extractBearer(req) || String(req.get('x-admin-token') || '').trim();
  const provided = String(rawProvided).replace(/^bearer\s+/i, '').trim();

  if (!provided || !expected || provided !== expected) {
    // Do not leak token; provide minimal diagnostics to help config issues.
    return res.status(401).json({
      data: {
        error: 'unauthorized',
        hasAdminTokenConfigured: true,
        hasProvidedToken: Boolean(rawProvided),
        providedTokenLength: rawProvided ? String(rawProvided).trim().length : 0,
      },
    });
  }

  return next();
}

module.exports = { requireAdmin };
