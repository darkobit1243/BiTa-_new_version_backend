const { getAdminToken } = require('../utils/admin');

function extractBearer(req) {
  const raw = String(req.get('authorization') || '').trim();
  if (!raw) return '';
  if (raw.toLowerCase().startsWith('bearer ')) return raw.slice(7).trim();
  return raw;
}

function requireAdmin(req, res, next) {
  const token = getAdminToken();
  if (!token) return next();

  const provided = extractBearer(req) || String(req.get('x-admin-token') || '').trim();
  if (!provided || provided !== token) {
    return res.status(401).json({ data: { error: 'unauthorized' } });
  }

  return next();
}

module.exports = { requireAdmin };
