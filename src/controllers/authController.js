const { store } = require('../store/store');

function sessionFromUser(user) {
  return {
    userId: user.userId,
    email: user.email,
    name: user.name,
    role: user.role,
    isPremium: user.isPremium,
    providerServiceType: user.providerServiceType,
  };
}

async function login(req, res) {
  const { email, password, role } = req.body || {};
  if (!email || !password || !role) {
    return res.status(400).json({ data: { error: 'email/password/role required' } });
  }

  // Mock auth: create user if not found.
  let user = await store.findUserByEmail(email);
  if (!user) {
    const isPremium = String(email).toLowerCase().includes('premium');
    user = await store.createUser({
      email: String(email),
      name: 'Demo Kullanıcı',
      role: String(role),
      isPremium,
      providerServiceType: role === 'provider' ? 'vehicle' : null,
    });
  }

  return res.json({ data: sessionFromUser(user) });
}

async function register(req, res) {
  const body = req.body || {};
  if (!body.email || !body.password || !body.role) {
    return res.status(400).json({ data: { error: 'email/password/role required' } });
  }

  const existing = await store.findUserByEmail(body.email);
  if (existing) {
    return res.status(409).json({ data: { error: 'user already exists' } });
  }

  const membershipType = String(body.membershipType || '').toLowerCase();
  const isPremium = membershipType === 'premium';

  const user = await store.createUser({
    email: String(body.email),
    name: String(body.name || 'Demo Kullanıcı'),
    role: String(body.role),
    isPremium,
    providerServiceType: body.providerServiceType || null,
  });

  return res.status(201).json({ data: sessionFromUser(user) });
}

module.exports = { login, register };
