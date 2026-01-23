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

function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isValidEmail(email) {
  const v = String(email || '').trim();
  // good-enough check (not full RFC)
  return v.includes('@') && v.includes('.') && v.length >= 6;
}

function getResetOtpTtlMs() {
  const mins = Number(process.env.RESET_OTP_TTL_MIN || 10);
  const m = Number.isFinite(mins) && mins > 0 ? mins : 10;
  return m * 60 * 1000;
}

function getResetOtpRateLimit() {
  const max = Number(process.env.RESET_OTP_RATE_LIMIT_MAX || 5);
  const windowMin = Number(process.env.RESET_OTP_RATE_LIMIT_WINDOW_MIN || 15);
  return {
    max: Number.isFinite(max) && max > 0 ? max : 5,
    windowMs: (Number.isFinite(windowMin) && windowMin > 0 ? windowMin : 15) * 60 * 1000,
  };
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

async function sendResetEmail({ to, otp }) {
  const cfg = smtpConfig();
  const mailer = getMailer();
  if (!mailer || !cfg.from) return { sent: false };

  const subject = 'BiTaşı • Şifre Sıfırlama Kodu';
  const text =
    `Şifre sıfırlama isteği alındı.\n\n` +
    `Şifre sıfırlama kodun: ${otp}\n` +
    `Kod 10 dakika geçerlidir.\n\n` +
    `Bu işlem sana ait değilse bu maili yok sayabilirsin.\n\n` +
    `BiTaşı`;

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

  const { max, windowMs } = getResetOtpRateLimit();
  const ip = String(req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim();
  const rateKey = `${ip}:${emailNorm || 'unknown'}`;

  if (!global.__otpRateLimiter) {
    global.__otpRateLimiter = new Map();
  }

  const limiter = global.__otpRateLimiter;
  const now = Date.now();
  const bucket = limiter.get(rateKey) || [];
  const recent = bucket.filter((ts) => now - ts < windowMs);
  if (recent.length >= max) {
    limiter.set(rateKey, recent);
    return res.json({ data: { ok: true, sent: true } });
  }
  recent.push(now);
  limiter.set(rateKey, recent);

  // Always return OK to reduce enumeration.
  if (!emailNorm || !isValidEmail(emailNorm)) {
    return res.json({ data: { ok: true, sent: true } });
  }

  const user = await store.findUserByEmail(emailNorm);
  if (!user) {
    return res.json({ data: { ok: true, sent: true } });
  }

  const otp = generateOtp();
  const otpHash = sha256Hex(otp);
  const expiresAt = new Date(Date.now() + getResetOtpTtlMs()).toISOString();

  if (store.createPasswordResetToken) {
    await store.createPasswordResetToken({ userId: user.userId, otpHash, expiresAt });
  }

  await sendResetEmail({ to: emailNorm, otp });
  return res.json({ data: { ok: true, sent: true } });
}

async function reset(req, res) {
  const { email, otp, newPassword, token, password } = req.body || {};
  const emailNorm = normalizeEmail(email);

  const finalOtp = String(otp || '').trim() || String(token || '').trim();
  const finalPassword = String(newPassword || '').trim() || String(password || '').trim();

  if (!emailNorm || !finalOtp || !finalPassword) {
    return res.status(400).json({ data: { error: 'email/otp/newPassword required' } });
  }

  if (String(finalPassword).length < 6) {
    return res.status(400).json({ data: { error: 'password must be at least 6 chars' } });
  }

  const user = await store.findUserByEmail(emailNorm, { includeAuth: true });
  if (!user) {
    return res.status(400).json({ data: { error: 'invalid or expired code' } });
  }

  const otpHash = sha256Hex(finalOtp);
  if (!store.findValidPasswordResetToken) {
    return res.status(500).json({ data: { error: 'reset token store not configured' } });
  }

  const tokenRow = await store.findValidPasswordResetToken({ userId: user.userId, otpHash });
  if (!tokenRow) {
    return res.status(400).json({ data: { error: 'invalid or expired code' } });
  }

  const passwordHash = await bcrypt.hash(String(finalPassword), 10);
  await store.setUserPassword({ userId: user.userId, passwordHash });

  if (store.markPasswordResetTokenUsed) {
    await store.markPasswordResetTokenUsed({ tokenId: tokenRow.id });
  }

  return res.json({ data: { ok: true } });
}

module.exports = { login, register, forgot, reset };
