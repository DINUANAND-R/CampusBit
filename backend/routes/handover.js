const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/handoverController');
const { protect } = require('../middleware/auth');

router.get('/:listingId', protect, ctrl.getHandover);
router.post('/:listingId/approve', protect, ctrl.approve);
router.post('/:listingId/reject', protect, ctrl.reject);
router.post('/:listingId/confirm', protect, ctrl.confirm);

module.exports = router;
