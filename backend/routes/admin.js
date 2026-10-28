const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/adminController');
const { protect, requireAdmin } = require('../middleware/auth');

// All admin routes strictly protected and require admin role
router.use(protect, requireAdmin);

router.get('/overview', ctrl.getOverview);
router.get('/users', ctrl.getUsers);
router.get('/users/:id', ctrl.getUserDetail);
router.patch('/users/:id/status', ctrl.updateUserStatus);
router.patch('/users/:id/role', ctrl.updateUserRole);

router.get('/listings', ctrl.getListings);
router.patch('/listings/:id/moderate', ctrl.moderateListing);

router.get('/reports', ctrl.getReports);
router.patch('/reports/:id', ctrl.updateReport);

router.get('/analytics', ctrl.getAnalytics);

module.exports = router;
