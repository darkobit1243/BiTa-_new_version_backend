const { store } = require('../store/store');
const { isAdminEmail } = require('../utils/admin');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');

function truthy(v) {
  return ['1', 'true', 'yes', 'on'].includes(String(v || '').toLowerCase());
}

function sha256Hex(input) {
  return crypto.createHash('sha256').update(String(input || '')).digest('hex');
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isValidEmail(email) {
  const v = String(email || '').trim();
  // good-enough check (not full RFC)
  return v.includes('@') && v.includes('.') && v.length >= 6;
}

function getResetTokenTtlMs() {
  const mins = Number(process.env.RESET_TOKEN_TTL_MIN || 30);
  const m = Number.isFinite(mins) && mins > 0 ? mins : 30;
  return m * 60 * 1000;
}

function getResetUrlBase() {
  return String(
    process.env.RESET_URL_BASE ||
      process.env.ADMIN_PANEL_URL ||
      process.env.PUBLIC_WEB_URL ||
      '',
  ).trim();
}

function buildResetLink({ token, email }) {
  const base = getResetUrlBase();
  if (!base) return null;
  try {
    const url = new URL(base);
    url.searchParams.set('reset', '1');
    url.searchParams.set('token', String(token));
    url.searchParams.set('email', String(email));
    return url.toString();
  } catch (_) {
    return null;
  }
}

let _mailer = null;

function smtpConfig() {
  const host = String(process.env.SMTP_HOST || '').trim();
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = truthy(process.env.SMTP_SECURE);
  const user = String(process.env.SMTP_USER || '').trim();
  const pass = String(process.env.SMTP_PASS || '').trim();
  const from = String(process.env.SMTP_FROM || user || '').trim();

  const enabled = !!(host && user && pass);
  return {
    enabled,
    host,
    port: Number.isFinite(port) ? port : 587,
    secure,
    auth: enabled ? { user, pass } : null,
    from,
  };
}

function getMailer() {
  if (_mailer) return _mailer;
  const cfg = smtpConfig();
  if (!cfg.enabled) return null;
  _mailer = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: cfg.auth,
  });
  return _mailer;
}

async function sendResetEmail({ to, link }) {
  const cfg = smtpConfig();
  const mailer = getMailer();
  if (!mailer || !cfg.from) return { sent: false };

  const subject = 'BiTaşı • Şifre Sıfırlama';
  const text =
    `Şifre sıfırlama isteği alındı.\n\n` +
    `Bu işlem sana ait değilse bu maili yok sayabilirsin.\n\n` +
    (link ? `Şifre sıfırlama linki: ${link}\n` : `Reset linki yapılandırılmadı.\n`) +
    `\nBiTaşı`;

  try {
    await mailer.sendMail({ from: cfg.from, to, subject, text });
    return { sent: true };
  } catch (e) {
    console.error('[auth] reset email send failed:', e);
    return { sent: false };
  }
}

function sessionFromUser(user) {
  return {
    userId: user.userId,
    email: user.email,
    name: user.name,
    role: user.role,
    isPremium: user.isPremium,
    providerServiceType: user.providerServiceType,
    approvalStatus: user.approvalStatus || 'pending',
    isAdmin: isAdminEmail(user.email),
  };
}

async function login(req, res) {
  const { email, password, role } = req.body || {};
  if (!email || !password || !role) {
    return res.status(400).json({ data: { error: 'email/password/role required' } });
  }

  const emailNorm = normalizeEmail(email);
  let user = await store.findUserByEmail(emailNorm, { includeAuth: true });

  if (!user) {
    const allowAutoCreate = truthy(process.env.AUTH_ALLOW_AUTO_CREATE || '1');
    if (!allowAutoCreate) {
      return res.status(401).json({ data: { error: 'invalid credentials' } });
    }

    const isPremium = String(emailNorm).includes('premium');
    const admin = isAdminEmail(emailNorm);
    const passwordHash = await bcrypt.hash(String(password), 10);
    user = await store.createUser({
      email: String(emailNorm),
      name: 'Demo Kullanıcı',
      role: String(role),
      isPremium,
      providerServiceType: role === 'provider' ? 'vehicle' : null,
      approvalStatus: admin ? 'approved' : 'pending',
      passwordHash,
    });
  } else {
    if (user.passwordHash) {
      const ok = await bcrypt.compare(String(password), String(user.passwordHash));
      if (!ok) {
        return res.status(401).json({ data: { error: 'invalid credentials' } });
      }
    } else {
      // legacy account: upgrade by setting password on first successful login
      const passwordHash = await bcrypt.hash(String(password), 10);
      await store.setUserPassword({ userId: user.userId, passwordHash });
    }
  }

  return res.json({ data: sessionFromUser(user) });
}

async function register(req, res) {
  const body = req.body || {};
  if (!body.email || !body.password || !body.role) {
    return res.status(400).json({ data: { error: 'email/password/role required' } });
  }

  const emailNorm = normalizeEmail(body.email);
  if (!isValidEmail(emailNorm)) {
    return res.status(400).json({ data: { error: 'invalid email' } });
  }

  if (String(body.password || '').length < 6) {
    return res.status(400).json({ data: { error: 'password must be at least 6 chars' } });
  }

  const existing = await store.findUserByEmail(emailNorm);
  if (existing) {
    return res.status(409).json({ data: { error: 'user already exists' } });
  }

  const membershipType = String(body.membershipType || '').toLowerCase();
  const isPremium = membershipType === 'premium';
  const admin = isAdminEmail(emailNorm);

  const passwordHash = await bcrypt.hash(String(body.password), 10);

  const user = await store.createUser({
    email: String(emailNorm),
    name: String(body.name || 'Demo Kullanıcı'),
    role: String(body.role),
    isPremium,
    providerServiceType: body.providerServiceType || null,
    approvalStatus: admin ? 'approved' : 'pending',
    passwordHash,
  });

  return res.status(201).json({ data: sessionFromUser(user) });
}

async function forgot(req, res) {
  const { email } = req.body || {};
  const emailNorm = normalizeEmail(email);

  // Always return OK to reduce enumeration.
  if (!emailNorm || !isValidEmail(emailNorm)) {
    return res.json({ data: { ok: true, sent: false } });
  }

  const user = await store.findUserByEmail(emailNorm);
  if (!user) {
    return res.json({ data: { ok: true, sent: false } });
  }

  const token = crypto.randomBytes(32).toString('hex');
  const resetTokenHash = sha256Hex(token);
  const resetTokenExpiresAt = new Date(Date.now() + getResetTokenTtlMs()).toISOString();
  await store.setUserResetToken({ userId: user.userId, resetTokenHash, resetTokenExpiresAt });

  const link = buildResetLink({ token, email: emailNorm });
  const { sent } = await sendResetEmail({ to: emailNorm, link });
  return res.json({ data: { ok: true, sent } });
}

async function reset(req, res) {
  const { email, token, password } = req.body || {};
  const emailNorm = normalizeEmail(email);

  if (!emailNorm || !token || !password) {
    return res.status(400).json({ data: { error: 'email/token/password required' } });
  }

  if (String(password).length < 6) {
    return res.status(400).json({ data: { error: 'password must be at least 6 chars' } });
  }

  const user = await store.findUserByEmail(emailNorm, { includeAuth: true });
  if (!user || !user.resetTokenHash || !user.resetTokenExpiresAt) {
    return res.status(400).json({ data: { error: 'invalid or expired token' } });
  }

  const expected = String(user.resetTokenHash);
  const actual = sha256Hex(token);
  const expMs = Date.parse(String(user.resetTokenExpiresAt));
  if (!expected || expected !== actual || !Number.isFinite(expMs) || expMs < Date.now()) {
    return res.status(400).json({ data: { error: 'invalid or expired token' } });
  }

  const passwordHash = await bcrypt.hash(String(password), 10);
  await store.setUserPassword({ userId: user.userId, passwordHash });
  await store.clearUserResetToken({ userId: user.userId });

  return res.json({ data: { ok: true } });
}

module.exports = { login, register, forgot, reset };
