const { store } = require('../store/store');

function sendStoreError(res, err) {
  const status = Number(err && err.status);
  if (Number.isFinite(status) && status >= 400 && status < 600) {
    return res.status(status).json({ data: { error: String(err.message || 'error') } });
  }
  console.error('[userController] error:', err);
  return res.status(500).json({ data: { error: 'internal error' } });
}

async function getUnlockedOffers(req, res) {
  const { userId } = req.params;
  const offerIds = await store.getUnlockedOfferIds(userId);
  return res.json({ data: offerIds });
}

async function unlockOffer(req, res) {
  const { userId } = req.params;
  const { offerId } = req.body || {};

  const parsed = Number(offerId);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return res.status(400).json({ data: { error: 'offerId must be a positive number' } });
  }

  await store.unlockOffer(userId, parsed);
  return res.status(201).json({ data: { ok: true } });
}

async function getMyOffers(req, res) {
  try {
    const { userId } = req.params;
    const { status } = req.query || {};

    const offers = await store.getOffersForProvider(userId, {
      status: status ? String(status) : null,
    });

    return res.json({ data: offers });
  } catch (e) {
    return sendStoreError(res, e);
  }
}

async function getAcceptedOffers(req, res) {
  try {
    const { userId } = req.params;
    const offers = await store.getOffersForProvider(userId, { status: 'accepted' });
    return res.json({ data: offers });
  } catch (e) {
    return sendStoreError(res, e);
  }
}

module.exports = { getUnlockedOffers, unlockOffer, getMyOffers, getAcceptedOffers };
