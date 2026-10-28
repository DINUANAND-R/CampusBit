const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/exchangeController');
const { protect } = require('../middleware/auth');

router.use(protect);

router.get('/', ctrl.getExchanges);
router.get('/:id', ctrl.getExchange);
router.post('/:id/handover-proposals', ctrl.proposeHandover);
router.patch('/:id/handover-proposals/:proposalId/respond', ctrl.respondHandoverProposal);
router.post('/:id/confirm-handover', ctrl.confirmHandover);
router.post('/:id/disputes', ctrl.raiseDispute);
router.get('/:id/history', ctrl.getHistory);

module.exports = router;
