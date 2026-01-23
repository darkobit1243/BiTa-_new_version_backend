const express = require('express');
const { getUnlockedOffers, unlockOffer, getMyOffers, getAcceptedOffers } = require('../controllers/userController');

const router = express.Router();

router.get('/:userId/unlocked-offers', getUnlockedOffers);
router.post('/:userId/unlocked-offers', unlockOffer);

// Provider: list own offers (optionally filter by ?status=accepted|pending)
router.get('/:userId/offers', getMyOffers);
router.get('/:userId/accepted-offers', getAcceptedOffers);

module.exports = router;
