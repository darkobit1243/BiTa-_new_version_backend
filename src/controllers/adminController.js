const { store } = require('../store/store');
const { isAdminEmail } = require('../utils/admin');

function normalizeStatus(v) {
  const s = String(v || '').trim().toLowerCase();
  if (!s || s === 'all') return null;
  if (s === 'pending' || s === 'approved' || s === 'rejected') return s;
  return null;
}

async function listUsers(req, res) {
  const status = normalizeStatus(req.query && req.query.status);
  const users = await store.listUsers({ status });
  const data = users.map((u) => ({ ...u, isAdmin: isAdminEmail(u.email) }));
  return res.json({ data });
}

async function approveUser(req, res) {
  const userId = String(req.params.userId);
  const updated = await store.setUserApproval({ userId, status: 'approved', reason: null });
  return res.json({ data: { ok: true, user: { ...updated, isAdmin: isAdminEmail(updated.email) } } });
}

async function rejectUser(req, res) {
  const userId = String(req.params.userId);
  const reason = req.body && req.body.reason ? String(req.body.reason) : null;
  const updated = await store.setUserApproval({ userId, status: 'rejected', reason });
  return res.json({ data: { ok: true, user: { ...updated, isAdmin: isAdminEmail(updated.email) } } });
}

module.exports = { listUsers, approveUser, rejectUser };
