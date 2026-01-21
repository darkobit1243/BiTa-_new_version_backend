const { db } = require('../store/db');

async function getUnlockedOffers(req, res) {
  const { userId } = req.params;
  const offerIds = db.getUnlockedOfferIds(userId);
  return res.json({ data: offerIds });
}

async function unlockOffer(req, res) {
  const { userId } = req.params;
  const { offerId } = req.body || {};

  const parsed = Number(offerId);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return res.status(400).json({ data: { error: 'offerId must be a positive number' } });
  }

  db.unlockOffer(userId, parsed);
  return res.status(201).json({ data: { ok: true } });
}

module.exports = { getUnlockedOffers, unlockOffer };
