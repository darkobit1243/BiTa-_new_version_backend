function parseList(v) {
  if (!v) return [];
  return String(v)
    .split(/[,\s]+/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

function getAdminEmails() {
  const single = String(process.env.ADMIN_EMAIL || '').trim();
  const list = parseList(process.env.ADMIN_EMAILS);
  const all = [single, ...list].filter(Boolean);
  if (all.length === 0) {
    all.push('admin@bitasi.com.tr');
  }
  return Array.from(new Set(all.map((e) => e.toLowerCase())));
}

function isAdminEmail(email) {
  const e = String(email || '').trim().toLowerCase();
  if (!e) return false;
  const admins = getAdminEmails();
  return admins.includes(e);
}

function getAdminToken() {
  return String(process.env.ADMIN_TOKEN || '').trim();
}

module.exports = { getAdminEmails, isAdminEmail, getAdminToken };
