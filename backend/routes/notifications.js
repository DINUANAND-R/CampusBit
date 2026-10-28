const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/notificationController');
const { protect } = require('../middleware/auth');

router.use(protect);

router.get('/', ctrl.getNotifications);
router.patch('/read-all', ctrl.markAllNotificationsRead);
router.patch('/:id/read', ctrl.markNotificationRead);

module.exports = router;
