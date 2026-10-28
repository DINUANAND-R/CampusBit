const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/itemRequestController');
const { protect, optionalAuth } = require('../middleware/auth');

router.get('/', optionalAuth, ctrl.getItemRequests);
router.get('/:id', optionalAuth, ctrl.getItemRequest);
router.post('/', protect, ctrl.createRequest);
router.patch('/:id/status', protect, ctrl.updateStatus);
router.patch('/:id', protect, ctrl.updateItemRequest);

module.exports = router;
