const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/wantedAlertController');
const { protect } = require('../middleware/auth');

router.use(protect);

router.post('/', ctrl.createAlert);
router.get('/', ctrl.getMyAlerts);
router.get('/:id', ctrl.getAlert);
router.patch('/:id', ctrl.updateAlert);
router.patch('/:id/status', ctrl.updateAlertStatus);
router.delete('/:id', ctrl.deleteAlert);
router.get('/:id/matches', ctrl.getAlertMatches);

module.exports = router;
