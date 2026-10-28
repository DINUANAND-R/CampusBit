import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { exchangesApi } from '../../api';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import toast from 'react-hot-toast';
import {
  Handshake,
  Calendar,
  Clock,
  MapPin,
  CheckCircle2,
  AlertTriangle,
  MessageSquare,
  ChevronRight,
  ShieldAlert,
  ArrowRight,
  User,
  History,
  X,
  Plus,
  Check,
  Send,
  ExternalLink,
} from 'lucide-react';
import { getImageUrl } from '../../utils/imageUrl';

const STATUS_CONFIG = {
  READY_TO_ARRANGE: {
    label: 'Ready to Arrange',
    color: 'bg-[#82C9FF]/10 text-[#82C9FF] border-[#82C9FF]/30',
    description: 'Auction won. Parties can now propose a campus meeting time and location.',
  },
  HANDOVER_SCHEDULED: {
    label: 'Handover Scheduled',
    color: 'bg-[#C6FF4D]/10 text-[#C6FF4D] border-[#C6FF4D]/30',
    description: 'Meeting agreed! Meet at the scheduled campus location.',
  },
  HANDED_OVER: {
    label: 'Confirmation Pending',
    color: 'bg-[#FFC857]/10 text-[#FFC857] border-[#FFC857]/30',
    description: 'One party has confirmed handover. Awaiting second confirmation to complete.',
  },
  COMPLETED: {
    label: 'Completed',
    color: 'bg-[#65D99A]/10 text-[#65D99A] border-[#65D99A]/30',
    description: 'Both parties confirmed handover. Transaction successfully finished!',
  },
  DISPUTED: {
    label: 'Disputed',
    color: 'bg-[#FF7373]/10 text-[#FF7373] border-[#FF7373]/30',
    description: 'A dispute has been raised. Admin moderation team has been notified.',
  },
  CANCELLED: {
    label: 'Cancelled',
    color: 'bg-[#202620] text-[#747D72] border-[#30372F]',
    description: 'Exchange cancelled.',
  },
};

const CAMPUS_SPOTS = [
  'Central Library Entrance',
  'Student Activity Center',
  'Main Cafeteria / Food Court',
  'Department Academic Block A',
  'Sports Complex Main Gate',
];

export default function ExchangeDashboardPage() {
  const { user } = useAuth();
  const { socket } = useSocket();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [exchanges, setExchanges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterRole, setFilterRole] = useState('all'); // 'all' | 'buyer' | 'seller'
  const [filterStatus, setFilterStatus] = useState('all');

  // Modals
  const [activeExchange, setActiveExchange] = useState(null);
  const [showProposalModal, setShowProposalModal] = useState(false);
  const [showDisputeModal, setShowDisputeModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyLogs, setHistoryLogs] = useState([]);

  // Proposal form
  const [proposalData, setProposalData] = useState({
    proposedDate: '',
    proposedTime: '',
    meetingLocation: '',
    notes: '',
  });

  // Dispute form
  const [disputeData, setDisputeData] = useState({
    reason: '',
    details: '',
  });
  const [submitting, setSubmitting] = useState(false);

  const fetchExchanges = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const params = {};
      if (filterRole !== 'all') params.role = filterRole;
      if (filterStatus !== 'all') params.status = filterStatus;

      const { data } = await exchangesApi.getAll(params);
      setExchanges(data.exchanges || []);

      // If specific id param in URL, highlight or load
      const targetId = searchParams.get('id');
      if (targetId && data.exchanges) {
        const found = data.exchanges.find((e) => e._id === targetId);
        if (found) setActiveExchange(found);
      }
    } catch (err) {
      if (!silent) toast.error('Failed to load exchanges');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [filterRole, filterStatus, searchParams]);

  useEffect(() => {
    fetchExchanges();
  }, [fetchExchanges]);

  // Real-time Socket.IO synchronization for exchange events
  useEffect(() => {
    if (!socket) return;

    const handleUpdate = () => {
      fetchExchanges(true);
    };

    socket.on('exchange:created', handleUpdate);
    socket.on('exchange:update', handleUpdate);
    socket.on('connect', handleUpdate);

    return () => {
      socket.off('exchange:created', handleUpdate);
      socket.off('exchange:update', handleUpdate);
      socket.off('connect', handleUpdate);
    };
  }, [socket, fetchExchanges]);

  const handleOpenProposal = (exchange) => {
    setActiveExchange(exchange);
    setProposalData({
      proposedDate: '',
      proposedTime: '14:00',
      meetingLocation: CAMPUS_SPOTS[0],
      notes: '',
    });
    setShowProposalModal(true);
  };

  const handleSubmitProposal = async (e) => {
    e.preventDefault();
    if (!proposalData.proposedDate || !proposalData.proposedTime || !proposalData.meetingLocation.trim()) {
      toast.error('Please specify date, time, and campus meeting location');
      return;
    }

    setSubmitting(true);
    try {
      await exchangesApi.proposeHandover(activeExchange._id, proposalData);
      toast.success('Handover arrangement proposed!');
      setShowProposalModal(false);
      fetchExchanges(true);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to submit proposal');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRespondProposal = async (exchange, accept) => {
    setSubmitting(true);
    try {
      await exchangesApi.respondProposal(exchange._id, exchange.handoverProposal._id, { accept });
      toast.success(accept ? 'Handover proposal accepted!' : 'Proposal declined');
      fetchExchanges(true);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error responding to proposal');
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmHandover = async (exchange) => {
    const isBuyer = exchange.buyer?._id === user?._id;
    const confirmPrompt = isBuyer
      ? 'Confirm that you have physically received this item?'
      : 'Confirm that you have handed over this item to the winning buyer?';

    if (!window.confirm(confirmPrompt)) return;

    setSubmitting(true);
    try {
      const { data } = await exchangesApi.confirmHandover(exchange._id, isBuyer ? 'buyer' : 'seller');
      toast.success(data.message || 'Confirmation recorded!');
      fetchExchanges(true);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to confirm handover');
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenDispute = (exchange) => {
    setActiveExchange(exchange);
    setDisputeData({ reason: '', details: '' });
    setShowDisputeModal(true);
  };

  const handleSubmitDispute = async (e) => {
    e.preventDefault();
    if (!disputeData.reason.trim()) {
      toast.error('Please enter a dispute reason');
      return;
    }

    setSubmitting(true);
    try {
      await exchangesApi.raiseDispute(activeExchange._id, disputeData);
      toast.success('Dispute submitted. Admin moderation team notified.');
      setShowDisputeModal(false);
      fetchExchanges(true);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to raise dispute');
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenHistory = async (exchange) => {
    setActiveExchange(exchange);
    setShowHistoryModal(true);
    try {
      const { data } = await exchangesApi.getHistory(exchange._id);
      setHistoryLogs(data.history || []);
    } catch {
      setHistoryLogs(exchange.history || []);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* ── Header ───────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="font-display font-800 text-3xl text-slate-100 flex items-center gap-3">
            <Handshake className="text-brand-400" size={32} />
            Product Exchange & Handover
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Coordinate safe physical handovers on campus for won and sold auctions.
          </p>
        </div>
      </div>

      {/* ── Filters Row ──────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        {/* Role Filters */}
        <div className="flex gap-1.5 p-1 rounded-xl bg-surface-800/80 border border-white/5">
          {[
            { id: 'all', label: 'All Roles' },
            { id: 'buyer', label: 'Purchases (Buyer)' },
            { id: 'seller', label: 'Sales (Seller)' },
          ].map((r) => (
            <button
              key={r.id}
              onClick={() => setFilterRole(r.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-600 transition-all ${
                filterRole === r.id
                  ? 'bg-brand-500 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        {/* Status Filters */}
        <div className="flex gap-1.5 p-1 rounded-xl bg-surface-800/80 border border-white/5 overflow-x-auto">
          {[
            { id: 'all', label: 'All Status' },
            { id: 'READY_TO_ARRANGE', label: 'Ready' },
            { id: 'HANDOVER_SCHEDULED', label: 'Scheduled' },
            { id: 'HANDED_OVER', label: 'In Progress' },
            { id: 'COMPLETED', label: 'Completed' },
            { id: 'DISPUTED', label: 'Disputed' },
          ].map((s) => (
            <button
              key={s.id}
              onClick={() => setFilterStatus(s.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-600 transition-all shrink-0 ${
                filterStatus === s.id
                  ? 'bg-brand-500 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Content ──────────────────────────────────────────────────── */}
      {loading ? (
        <div className="flex flex-col gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="glass rounded-2xl h-44 animate-pulse" />
          ))}
        </div>
      ) : exchanges.length === 0 ? (
        <div className="glass rounded-2xl p-12 text-center flex flex-col items-center justify-center">
          <div className="w-16 h-16 rounded-2xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-400 mb-4">
            <Handshake size={32} />
          </div>
          <h3 className="font-display font-700 text-lg text-slate-100">No transactions found</h3>
          <p className="text-slate-400 text-xs max-w-md mt-1 mb-6 leading-relaxed">
            When you win an auction as a bidder or sell an item as a seller, a product exchange will appear here to coordinate safe physical delivery on campus.
          </p>
          <Link to="/" className="btn btn-primary btn-sm">
            Browse Active Auctions
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {exchanges.map((exchange) => {
            const isBuyer = exchange.buyer?._id === user?._id;
            const isSeller = exchange.seller?._id === user?._id;
            const counterparty = isBuyer ? exchange.seller : exchange.buyer;
            const roleBadge = isBuyer ? 'You are Buyer' : 'You are Seller';
            const statusInfo = STATUS_CONFIG[exchange.status] || STATUS_CONFIG.READY_TO_ARRANGE;

            const hasProposal = Boolean(exchange.handoverProposal);
            const proposal = exchange.handoverProposal;
            const isProposalPending =
              hasProposal &&
              (proposal.status === 'PROPOSED' || proposal.status === 'PENDING');
            const proposerId = String(proposal?.proposedById || proposal?.proposedBy?._id || proposal?.proposedBy || '');
            const currentUserId = String(user?._id || '');
            const isProposer =
              proposerId === currentUserId ||
              (proposal?.proposedRole ? (isBuyer && proposal.proposedRole === 'buyer') || (isSeller && proposal.proposedRole === 'seller') : false);
            const isProposalRecipient = isProposalPending && !isProposer;

            return (
              <div
                key={exchange._id}
                className="bg-[#1B201B] rounded-2xl p-6 border border-[#30372F] hover:border-[#C6FF4D]/30 transition-all flex flex-col gap-5 shadow-lg"
              >
                {/* ── Top Row: Product + Counterparty Info ── */}
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <img
                      src={getImageUrl(exchange.listing?.images?.[0])}
                      alt={exchange.listing?.title}
                      className="w-16 h-16 rounded-xl object-cover bg-[#101211] border border-[#30372F] shrink-0"
                    />
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-[#C6FF4D]/15 text-[#C6FF4D] border border-[#C6FF4D]/30 uppercase tracking-wider">
                          {roleBadge}
                        </span>
                        <span
                          className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${statusInfo.color}`}
                        >
                          {statusInfo.label}
                        </span>
                      </div>
                      <h3 className="font-display font-700 text-lg text-[#F4F5F0] hover:text-[#C6FF4D] transition-colors">
                        <Link to={`/listings/${exchange.listing?._id}`}>
                          {exchange.listing?.title}
                        </Link>
                      </h3>
                      <p className="text-xs text-[#A1A79E] mt-0.5">
                        Winning bid: <strong className="text-[#65D99A] font-bold tabular-nums">₹{exchange.winningAmount?.toLocaleString()}</strong> • With @{counterparty?.username}
                      </p>
                    </div>
                  </div>

                  {/* Actions Right */}
                  <div className="flex items-center gap-2 self-start sm:self-auto">
                    {/* Chat Button */}
                    <Link
                      to={`/chat?conv=${exchange.conversation?._id || ''}`}
                      id={`chat-exchange-${exchange._id}`}
                      className="btn btn-secondary btn-sm flex items-center gap-1.5 text-xs text-[#A1A79E] hover:text-[#F4F5F0]"
                    >
                      <MessageSquare size={14} className="text-[#C6FF4D]" /> Chat
                    </Link>

                    {/* Timeline History */}
                    <button
                      onClick={() => handleOpenHistory(exchange)}
                      className="btn btn-secondary btn-sm flex items-center gap-1.5 text-xs text-[#A1A79E] hover:text-[#F4F5F0]"
                      title="View audit trail"
                    >
                      <History size={14} /> History
                    </button>

                    {/* Dispute */}
                    {exchange.status !== 'COMPLETED' && exchange.status !== 'DISPUTED' && (
                      <button
                        onClick={() => handleOpenDispute(exchange)}
                        className="btn btn-secondary btn-sm p-2 text-[#FF7373] hover:text-[#FF7373] hover:bg-[#FF7373]/10"
                        title="Raise dispute"
                      >
                        <ShieldAlert size={15} />
                      </button>
                    )}
                  </div>
                </div>

                {/* ── Middle: Handover Arrangement Status Box ── */}
                <div className="p-4 rounded-xl bg-[#151815] border border-[#30372F] flex flex-col gap-3">
                  {hasProposal ? (
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
                          <MapPin size={15} className="text-amber-400 shrink-0" />
                          <span>{proposal.meetingLocation}</span>
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              proposal.status === 'ACCEPTED'
                                ? 'bg-emerald-500/20 text-emerald-300'
                                : (proposal.status === 'REJECTED' || proposal.status === 'DECLINED')
                                ? 'bg-rose-500/20 text-rose-300'
                                : 'bg-amber-500/20 text-amber-300 animate-pulse'
                            }`}
                          >
                            {proposal.status === 'ACCEPTED'
                              ? 'Arrangement Agreed'
                              : (proposal.status === 'REJECTED' || proposal.status === 'DECLINED')
                              ? 'Arrangement Declined'
                              : isProposer
                              ? 'Awaiting Counterparty'
                              : 'Proposal Received'}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-slate-400 mt-1">
                          <span className="flex items-center gap-1">
                            <Calendar size={13} />
                            {new Date(proposal.proposedDate).toLocaleDateString()}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock size={13} />
                            {proposal.proposedTime}
                          </span>
                          {proposal.notes && (
                            <span className="italic text-slate-500">"{proposal.notes}"</span>
                          )}
                        </div>
                      </div>

                      {/* Recipient Action: Accept or Decline */}
                      {isProposalRecipient && (
                        <div className="flex items-center gap-2">
                          <button
                            disabled={submitting}
                            onClick={() => handleRespondProposal(exchange, true)}
                            className="btn btn-primary btn-sm py-1 px-3 text-xs flex items-center gap-1 bg-emerald-600 hover:bg-emerald-500"
                          >
                            <Check size={14} /> Accept Proposal
                          </button>
                          <button
                            disabled={submitting}
                            onClick={() => handleRespondProposal(exchange, false)}
                            className="btn btn-secondary btn-sm py-1 px-3 text-xs text-rose-400 hover:text-rose-300"
                          >
                            Decline
                          </button>
                        </div>
                      )}

                      {/* If declined and not completed, allow proposing a new meeting point */}
                      {(proposal.status === 'REJECTED' || proposal.status === 'DECLINED') && exchange.status !== 'COMPLETED' && (
                        <button
                          onClick={() => handleOpenProposal(exchange)}
                          className="btn btn-primary btn-sm py-1 px-3 text-xs flex items-center gap-1"
                        >
                          <Plus size={14} /> Propose New Spot
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-3 text-xs text-slate-400">
                      <span>No campus handover location has been proposed yet.</span>
                      {exchange.status !== 'COMPLETED' && exchange.status !== 'CANCELLED' && (
                        <button
                          onClick={() => handleOpenProposal(exchange)}
                          className="btn btn-primary btn-sm py-1 px-3 text-xs flex items-center gap-1"
                        >
                          <Plus size={14} /> Propose Meeting Point
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* ── Bottom: Two-Party Confirmation Actions ── */}
                <div className="pt-2 border-t border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  {/* Two-party indicators */}
                  <div className="flex items-center gap-6 text-xs">
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${
                          exchange.sellerHandedOverAt
                            ? 'bg-emerald-500 text-white'
                            : 'bg-surface-700 text-slate-500'
                        }`}
                      >
                        ✓
                      </div>
                      <span className={exchange.sellerHandedOverAt ? 'text-slate-200 font-medium' : 'text-slate-500'}>
                        Seller Handed Over
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <div
                        className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${
                          exchange.buyerReceivedAt
                            ? 'bg-emerald-500 text-white'
                            : 'bg-surface-700 text-slate-500'
                        }`}
                      >
                        ✓
                      </div>
                      <span className={exchange.buyerReceivedAt ? 'text-slate-200 font-medium' : 'text-slate-500'}>
                        Buyer Received
                      </span>
                    </div>
                  </div>

                  {/* Confirmation Button */}
                  {exchange.status !== 'COMPLETED' && exchange.status !== 'CANCELLED' && exchange.status !== 'DISPUTED' && (
                    <div className="flex items-center gap-2">
                      {isSeller && !exchange.sellerHandedOverAt && (
                        <button
                          disabled={submitting}
                          onClick={() => handleConfirmHandover(exchange)}
                          className="btn btn-primary btn-sm py-1.5 px-4 text-xs flex items-center gap-1.5 shadow-lg shadow-brand-500/20"
                        >
                          <CheckCircle2 size={15} /> Confirm Product Handed Over
                        </button>
                      )}

                      {isBuyer && !exchange.buyerReceivedAt && (
                        <button
                          disabled={submitting}
                          onClick={() => handleConfirmHandover(exchange)}
                          className="btn btn-primary btn-sm py-1.5 px-4 text-xs flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 shadow-lg shadow-emerald-500/20"
                        >
                          <CheckCircle2 size={15} /> Confirm Product Received
                        </button>
                      )}

                      {((isSeller && exchange.sellerHandedOverAt && !exchange.buyerReceivedAt) ||
                        (isBuyer && exchange.buyerReceivedAt && !exchange.sellerHandedOverAt)) && (
                        <span className="text-xs text-amber-400 italic">
                          Awaiting other party's confirmation...
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Modal: Propose Handover ───────────────────────────────────── */}
      {showProposalModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="glass-panel border border-white/10 rounded-2xl max-w-md w-full p-6 shadow-2xl bg-slate-900/95">
            <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4">
              <h3 className="font-display font-700 text-lg text-slate-100 flex items-center gap-2">
                <MapPin size={18} className="text-amber-400" /> Propose Meeting Details
              </h3>
              <button
                onClick={() => setShowProposalModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmitProposal} className="flex flex-col gap-4 text-xs">
              {/* Meeting Spot Quick Suggestions */}
              <div>
                <label className="block text-slate-300 font-medium mb-1.5">
                  Campus Meeting Location
                </label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {CAMPUS_SPOTS.map((spot) => (
                    <button
                      type="button"
                      key={spot}
                      onClick={() => setProposalData({ ...proposalData, meetingLocation: spot })}
                      className={`px-2 py-1 rounded-lg text-[10px] transition-all border ${
                        proposalData.meetingLocation === spot
                          ? 'bg-brand-500 text-white border-brand-400'
                          : 'bg-surface-700 text-slate-300 border-white/5 hover:bg-surface-600'
                      }`}
                    >
                      {spot}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  required
                  placeholder="Or enter custom campus building / location"
                  value={proposalData.meetingLocation}
                  onChange={(e) => setProposalData({ ...proposalData, meetingLocation: e.target.value })}
                  className="input w-full py-2 text-xs"
                />
              </div>

              {/* Date & Time */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Date</label>
                  <input
                    type="date"
                    required
                    value={proposalData.proposedDate}
                    onChange={(e) => setProposalData({ ...proposalData, proposedDate: e.target.value })}
                    className="input w-full py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Time</label>
                  <input
                    type="time"
                    required
                    value={proposalData.proposedTime}
                    onChange={(e) => setProposalData({ ...proposalData, proposedTime: e.target.value })}
                    className="input w-full py-2 text-xs"
                  />
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  Optional Instructions
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. I will be wearing a blue hoodie near the entrance."
                  value={proposalData.notes}
                  onChange={(e) => setProposalData({ ...proposalData, notes: e.target.value })}
                  className="input w-full py-2 text-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10 mt-2">
                <button
                  type="button"
                  onClick={() => setShowProposalModal(false)}
                  className="btn btn-secondary btn-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="btn btn-primary btn-sm flex items-center gap-1.5"
                >
                  {submitting ? 'Submitting...' : 'Send Handover Proposal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal: Dispute ───────────────────────────────────────────── */}
      {showDisputeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="glass-panel border border-rose-500/30 rounded-2xl max-w-md w-full p-6 shadow-2xl bg-slate-900/95">
            <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4">
              <h3 className="font-display font-700 text-lg text-rose-400 flex items-center gap-2">
                <ShieldAlert size={18} /> Raise a Transaction Dispute
              </h3>
              <button
                onClick={() => setShowDisputeModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmitDispute} className="flex flex-col gap-4 text-xs">
              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  Reason for dispute <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Counterparty did not show up / Condition mismatch"
                  value={disputeData.reason}
                  onChange={(e) => setDisputeData({ ...disputeData, reason: e.target.value })}
                  className="input w-full py-2 text-xs"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  Additional Details
                </label>
                <textarea
                  rows={3}
                  placeholder="Describe the issue clearly for administrative moderation review."
                  value={disputeData.details}
                  onChange={(e) => setDisputeData({ ...disputeData, details: e.target.value })}
                  className="input w-full py-2 text-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10 mt-2">
                <button
                  type="button"
                  onClick={() => setShowDisputeModal(false)}
                  className="btn btn-secondary btn-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="btn btn-danger btn-sm"
                >
                  {submitting ? 'Submitting...' : 'Submit Dispute'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal: History Audit Trail ─────────────────────────────────── */}
      {showHistoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="glass-panel border border-white/10 rounded-2xl max-w-lg w-full p-6 shadow-2xl bg-slate-900/95 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4 shrink-0">
              <h3 className="font-display font-700 text-lg text-slate-100 flex items-center gap-2">
                <History size={18} className="text-brand-400" /> Exchange History
              </h3>
              <button
                onClick={() => setShowHistoryModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 divide-y divide-white/5 scrollbar-thin">
              {historyLogs.length === 0 ? (
                <p className="p-4 text-center text-xs text-slate-500">No history entries recorded.</p>
              ) : (
                historyLogs.map((entry, idx) => (
                  <div key={idx} className="py-2.5 text-xs">
                    <div className="flex items-center justify-between gap-2 text-slate-300">
                      <span className="font-semibold">{entry.action}</span>
                      <span className="text-[10px] text-slate-500">
                        {new Date(entry.timestamp).toLocaleString()}
                      </span>
                    </div>
                    {entry.note && (
                      <p className="text-[11px] text-slate-400 mt-0.5">{entry.note}</p>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
