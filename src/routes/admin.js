const express = require('express');
const { requireAdmin } = require('../middleware/adminAuth');
const { listUsers, approveUser, rejectUser } = require('../controllers/adminController');

const router = express.Router();

router.use(requireAdmin);

router.get('/health', (req, res) => {
	return res.json({ data: { ok: true, scope: 'admin' } });
});

router.get('/users', listUsers);
router.post('/users/:userId/approve', approveUser);
router.post('/users/:userId/reject', rejectUser);

module.exports = router;
