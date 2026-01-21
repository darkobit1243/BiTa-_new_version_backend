const express = require('express');
const { getUnlockedOffers, unlockOffer } = require('../controllers/userController');

const router = express.Router();

router.get('/:userId/unlocked-offers', getUnlockedOffers);
router.post('/:userId/unlocked-offers', unlockOffer);

module.exports = router;
