const express = require('express');
const { login, register, forgot, reset } = require('../controllers/authController');

const router = express.Router();

router.post('/login', login);
router.post('/register', register);
router.post('/forgot', forgot);
router.post('/reset', reset);

module.exports = router;
