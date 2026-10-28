import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { handoverApi, listingsApi } from '../../api';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import toast from 'react-hot-toast';
import {
  CheckCircle,
  XCircle,
  Key,
  Package,
  Loader,
  ArrowLeft,
  Copy,
  Check,
  ShieldCheck,
  RefreshCw,
  Clock,
} from 'lucide-react';

export default function HandoverPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const { socket } = useSocket();
  const navigate = useNavigate();

  const [listing, setListing] = useState(null);
  const [handover, setHandover] = useState(null);
  const [loading, setLoading] = useState(true);
  const [otp, setOtp] = useState('');
  const [reason, setReason] = useState('');
  const [showRejectBox, setShowRejectBox] = useState(false);
  const [acting, setActing] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [{ data: ld }, hdRes] = await Promise.all([
        listingsApi.getOne(id),
        handoverApi.get(id).catch(() => ({ data: { handover: null } })),
      ]);
      setListing(ld.listing);
      setHandover(hdRes.data.handover);
    } catch (err) {
      if (!silent) {
        toast.error(err.response?.data?.message || 'Failed to load handover details');
        navigate('/dashboard');
      }
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [id]);

  // Real-time synchronization via Socket.IO
  useEffect(() => {
    if (!socket) return;
    const handleUpdate = () => load(true);
    socket.on('handover:approved', handleUpdate);
    socket.on('handover:completed', handleUpdate);
    socket.on('exchange:update', handleUpdate);
    return () => {
      socket.off('handover:approved', handleUpdate);
      socket.off('handover:completed', handleUpdate);
      socket.off('exchange:update', handleUpdate);
    };
  }, [socket, id]);

  // Live polling fallback every 2.5s until completed
  useEffect(() => {
    if (handover?.completedAt) return;
    const timer = setInterval(() => {
      handoverApi
        .get(id)
        .then(({ data }) => {
          if (data?.handover) {
            setHandover(data.handover);
          }
        })
        .catch(() => {});
    }, 2500);
    return () => clearInterval(timer);
  }, [id, handover?.completedAt]);

  // Robust string-based participant identification
  const currentUserId = String(user?._id || '');
  const sellerId = String(
    listing?.seller?._id || listing?.seller || handover?.seller?._id || handover?.seller || ''
  );
  const buyerId = String(
    listing?.winner?._id || listing?.winner || handover?.buyer?._id || handover?.buyer || ''
  );
  const isSeller = Boolean(currentUserId && sellerId && currentUserId === sellerId);
  const isBuyer = Boolean(currentUserId && buyerId && currentUserId === buyerId);

  const approve = async () => {
    setActing(true);
    try {
      const { data } = await handoverApi.approve(id);
      toast.success(`Approved! Handover OTP generated: ${data.handoverCode}`);
      setHandover(data.handover);
      await load(true);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to approve handover');
    } finally {
      setActing(false);
    }
  };

  const reject = async () => {
    if (!reason.trim()) {
      toast.error('Please enter a reason for cancellation');
      return;
    }
    setActing(true);
    try {
      await handoverApi.reject(id, reason);
      toast.success('Rejected — item marked as unsold');
      await load(true);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to reject handover');
    } finally {
      setActing(false);
    }
  };

  const confirm = async (e) => {
    if (e) e.preventDefault();
    const cleanCode = otp.trim().replace(/\D/g, '');
    if (cleanCode.length !== 6) {
      toast.error('Please enter the full 6-digit handover code');
      return;
    }
    setActing(true);
    try {
      const { data } = await handoverApi.confirm(id, cleanCode);
      toast.success('🎉 Product Handover verified and completed successfully!');
      setHandover(data.handover);
      await load(true);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Invalid handover code. Please check with the seller.');
    } finally {
      setActing(false);
    }
  };

  const handleCopyCode = () => {
    if (handover?.handoverCode) {
      navigator.clipboard.writeText(handover.handoverCode);
      setCopied(true);
      toast.success('Handover OTP copied!');
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (loading) {
    return (
      <div className="max-w-lg mx-auto px-4 py-20 text-center">
        <Loader size={36} className="animate-spin text-[#C6FF4D] mx-auto mb-3" />
        <p className="text-xs text-[#A1A79E]">Loading handover OTP details…</p>
      </div>
    );
  }

  const isCompleted = Boolean(handover?.completedAt);
  const isApproved = handover?.sellerDecision === 'approved';
  const isRejected = handover?.sellerDecision === 'rejected';

  return (
    <div className="max-w-lg mx-auto px-4 py-8 text-[#F4F5F0]">
      {/* Top back navigation */}
      <div className="flex items-center justify-between mb-6">
        <Link
          to={`/listings/${id}`}
          className="flex items-center gap-1.5 text-xs text-[#A1A79E] hover:text-[#F4F5F0] transition-colors"
        >
          <ArrowLeft size={14} /> Back to listing
        </Link>
        <button
          onClick={() => load()}
          title="Refresh status"
          className="p-1.5 rounded-lg text-[#747D72] hover:text-[#C6FF4D] hover:bg-[#151815] transition-all"
        >
          <RefreshCw size={14} />
        </button>
      </div>

      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="p-1.5 rounded-lg bg-[#C6FF4D]/10 text-[#C6FF4D] border border-[#C6FF4D]/30">
            <Key size={16} />
          </span>
          <h1 className="font-display font-700 text-2xl text-[#F4F5F0]">Product Handover (OTP)</h1>
        </div>
        <p className="text-[#A1A79E] text-xs">
          Auction Item: <strong className="text-[#F4F5F0]">{listing?.title}</strong>
        </p>
      </div>

      {/* Summary card */}
      <div className="bg-[#1B201B] border border-[#30372F] rounded-2xl p-5 mb-6 flex flex-col gap-3 shadow-lg">
        <div className="flex justify-between items-center text-sm border-b border-[#30372F]/60 pb-3">
          <span className="text-[#A1A79E]">Final Winning Price</span>
          <span className="font-display font-800 text-[#C6FF4D] text-xl tabular-nums">
            ₹{handover?.finalPrice ? handover.finalPrice.toLocaleString() : (listing?.currentPrice || 0).toLocaleString()}
          </span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-[#A1A79E]">Seller</span>
          <span className="text-[#F4F5F0] font-600">
            @{handover?.seller?.username || listing?.seller?.username || 'Seller'}
            {isSeller && <span className="text-[#C6FF4D] ml-1 font-bold">(You)</span>}
          </span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-[#A1A79E]">Buyer (Winner)</span>
          <span className="text-[#F4F5F0] font-600">
            @{handover?.buyer?.username || listing?.winner?.username || 'Buyer'}
            {isBuyer && <span className="text-[#C6FF4D] ml-1 font-bold">(You)</span>}
          </span>
        </div>
        <div className="flex justify-between text-xs pt-1 border-t border-[#30372F]/60">
          <span className="text-[#A1A79E]">Handover Verification Status</span>
          <span
            className={`font-700 capitalize ${
              isCompleted
                ? 'text-[#65D99A]'
                : isRejected
                ? 'text-[#FF7373]'
                : isApproved
                ? 'text-[#C6FF4D]'
                : 'text-[#FFC857]'
            }`}
          >
            {isCompleted ? '✅ Handover Completed' : isRejected ? '❌ Rejected' : isApproved ? '🔑 Approved & OTP Generated' : '⏳ Awaiting Seller Approval'}
          </span>
        </div>
      </div>

      {/* ── Completed State ── */}
      {isCompleted && (
        <div className="bg-[#1B201B] border border-[#65D99A]/40 rounded-2xl p-6 text-center shadow-xl animate-fade-in mb-6">
          <div className="w-14 h-14 rounded-full bg-[#65D99A]/15 border border-[#65D99A]/30 flex items-center justify-center mx-auto mb-3">
            <CheckCircle size={32} className="text-[#65D99A]" />
          </div>
          <h2 className="font-display font-700 text-xl text-[#65D99A] mb-1">
            Product Handover Complete!
          </h2>
          <p className="text-[#A1A79E] text-xs max-w-sm mx-auto mb-4">
            The 6-digit OTP code was successfully verified. The buyer received the item and the transaction is finalized.
          </p>
          <div className="bg-[#151815] border border-[#30372F] rounded-xl p-3 text-xs text-[#747D72] flex items-center justify-center gap-1.5">
            <Clock size={13} />
            <span>Verified on {new Date(handover.completedAt).toLocaleString()}</span>
          </div>
        </div>
      )}

      {/* ── Seller View: Need to Approve ── */}
      {isSeller && !isCompleted && !isApproved && !isRejected && (
        <div className="bg-[#1B201B] border border-[#C6FF4D]/30 rounded-2xl p-6 flex flex-col gap-4 shadow-xl mb-6">
          <div>
            <h2 className="font-600 text-[#F4F5F0] text-base mb-1 flex items-center gap-2">
              <Key size={18} className="text-[#C6FF4D]" /> Step 1: Approve Handover
            </h2>
            <p className="text-[#A1A79E] text-xs leading-relaxed">
              The buyer won your auction for <strong className="text-[#F4F5F0]">₹{handover?.finalPrice?.toLocaleString()}</strong>.
              Click below to generate your secure 6-digit OTP code to share with the buyer in person.
            </p>
          </div>

          <div className="flex gap-3">
            <button
              id="approve-btn"
              onClick={approve}
              disabled={acting}
              className="btn btn-primary flex-1 py-3 text-sm font-bold flex items-center justify-center gap-2"
            >
              {acting ? <Loader size={16} className="animate-spin" /> : <Key size={16} />}
              <span>Approve & Generate OTP</span>
            </button>
            <button
              id="reject-btn"
              type="button"
              onClick={() => setShowRejectBox((v) => !v)}
              className="btn btn-secondary text-xs px-4 text-[#FF7373] hover:bg-[#FF7373]/10 border-[#FF7373]/30"
              disabled={acting}
            >
              {showRejectBox ? 'Cancel' : 'Reject Sale'}
            </button>
          </div>

          {/* Rejection input */}
          {showRejectBox && (
            <div className="bg-[#151815] border border-[#30372F] rounded-xl p-4 flex flex-col gap-2 mt-1 animate-fade-in">
              <label className="text-[11px] text-[#FF7373] uppercase font-600 tracking-wider block">
                Reason for rejection (marks listing unsold):
              </label>
              <input
                className="input text-xs bg-[#101211] border-[#30372F] text-[#F4F5F0]"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Item broken, buyer unresponsive…"
              />
              <button
                id="confirm-reject-btn"
                onClick={reject}
                disabled={acting || !reason.trim()}
                className="btn btn-danger btn-sm mt-1 w-full text-xs font-semibold"
              >
                Confirm Rejection & Cancel
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Seller View: Approved, Show Code ── */}
      {isSeller && !isCompleted && isApproved && (
        <div className="bg-[#1B201B] border border-[#C6FF4D]/50 rounded-2xl p-6 flex flex-col gap-4 shadow-2xl mb-6">
          <div className="flex items-center justify-between">
            <h2 className="font-600 text-[#C6FF4D] text-sm uppercase tracking-wider flex items-center gap-2">
              <Key size={16} /> Your Handover OTP Code
            </h2>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#C6FF4D]/10 text-[#C6FF4D] border border-[#C6FF4D]/30 font-600 animate-pulse">
              Ready for Buyer
            </span>
          </div>

          <p className="text-[#A1A79E] text-xs">
            Hand over the product to buyer <strong className="text-[#F4F5F0]">@{handover?.buyer?.username}</strong>, then share this 6-digit code with them:
          </p>

          <div className="text-center bg-[#151815] rounded-2xl py-6 px-4 border border-[#C6FF4D]/40 flex flex-col items-center justify-center gap-3">
            <span
              id="seller-handover-code"
              className="font-mono font-900 text-5xl tracking-[0.25em] text-[#C6FF4D] tabular-nums select-all"
            >
              {handover.handoverCode}
            </span>
            <button
              type="button"
              onClick={handleCopyCode}
              className="btn btn-secondary btn-sm py-1.5 px-3 text-xs flex items-center gap-1.5 text-[#F4F5F0] hover:text-[#C6FF4D]"
            >
              {copied ? <Check size={13} className="text-[#65D99A]" /> : <Copy size={13} />}
              <span>{copied ? 'Copied to Clipboard' : 'Copy 6-Digit Code'}</span>
            </button>
          </div>

          <p className="text-[#747D72] text-[11px] text-center italic">
            Once the buyer enters this code on their screen, your transaction will instantly verify and mark as complete.
          </p>
        </div>
      )}

      {/* ── Buyer View: Enter Code ── */}
      {isBuyer && !isCompleted && isApproved && (
        <form onSubmit={confirm} className="bg-[#1B201B] border border-[#C6FF4D]/40 rounded-2xl p-6 flex flex-col gap-4 shadow-xl mb-6">
          <div className="flex items-center justify-between">
            <h2 className="font-600 text-[#F4F5F0] text-base flex items-center gap-2">
              <Key size={18} className="text-[#C6FF4D]" /> Enter Handover OTP Code
            </h2>
            <span className="text-[11px] font-bold text-[#65D99A] uppercase tracking-wider bg-[#65D99A]/10 px-2 py-0.5 rounded-full border border-[#65D99A]/20">
              Seller Approved
            </span>
          </div>

          <p className="text-[#A1A79E] text-xs leading-relaxed">
            Meet seller <strong className="text-[#F4F5F0]">@{handover?.seller?.username}</strong> in person, inspect the item, and get their 6-digit handover code. Enter it below to confirm you received the item.
          </p>

          <div className="flex flex-col gap-2">
            <input
              id="otp-input"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="one-time-code"
              className="input text-center font-mono text-3xl sm:text-4xl tracking-[0.25em] py-4 bg-[#101211] border-[#30372F] focus:border-[#C6FF4D] text-[#C6FF4D] font-bold tabular-nums"
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="••••••"
              autoFocus
            />
            <p className="text-[#747D72] text-[11px] text-center">
              Enter the 6 digits given by the seller
            </p>
          </div>

          <button
            id="confirm-otp-btn"
            type="submit"
            disabled={acting || otp.length !== 6}
            className="btn btn-primary w-full py-3 text-sm font-bold flex items-center justify-center gap-2"
          >
            {acting ? (
              <Loader size={16} className="animate-spin" />
            ) : (
              <CheckCircle size={16} />
            )}
            <span>Verify & Confirm Handover</span>
          </button>
        </form>
      )}

      {/* ── Buyer View: Awaiting Seller Approval ── */}
      {isBuyer && !isCompleted && !isApproved && !isRejected && (
        <div className="bg-[#1B201B] border border-[#FFC857]/30 rounded-2xl p-6 text-center shadow-lg mb-6">
          <div className="w-12 h-12 rounded-full bg-[#FFC857]/15 border border-[#FFC857]/30 flex items-center justify-center mx-auto mb-3">
            <Clock size={24} className="text-[#FFC857] animate-pulse" />
          </div>
          <h2 className="font-700 text-lg text-[#FFC857] mb-1">
            Awaiting Seller Handover Code
          </h2>
          <p className="text-[#A1A79E] text-xs max-w-sm mx-auto mb-3">
            Seller <strong className="text-[#F4F5F0]">@{handover?.seller?.username || listing?.seller?.username}</strong> needs to click "Approve" to generate your 6-digit handover OTP code.
          </p>
          <div className="inline-flex items-center gap-2 text-[11px] text-[#747D72] bg-[#151815] px-3 py-1.5 rounded-full border border-[#30372F]">
            <Loader size={12} className="animate-spin text-[#FFC857]" />
            <span>Listening for seller approval in real-time…</span>
          </div>
        </div>
      )}

      {/* ── Rejected State ── */}
      {isRejected && (
        <div className="bg-[#1B201B] border border-[#FF7373]/30 rounded-2xl p-6 text-center shadow-lg mb-6">
          <XCircle size={40} className="text-[#FF7373] mx-auto mb-2" />
          <h2 className="font-700 text-lg text-[#FF7373] mb-1">Handover Cancelled / Rejected</h2>
          <p className="text-[#A1A79E] text-xs">
            {handover.rejectionReason || 'The seller rejected this handover transaction.'}
          </p>
        </div>
      )}

      {/* ── Guest / Observer View (Neither Buyer nor Seller) ── */}
      {!isSeller && !isBuyer && (
        <div className="bg-[#1B201B] border border-[#30372F] rounded-2xl p-6 text-center shadow-lg mb-6">
          <ShieldCheck size={36} className="text-[#A1A79E] mx-auto mb-2" />
          <h2 className="font-600 text-sm text-[#F4F5F0] mb-1">Handover in Progress</h2>
          <p className="text-[#A1A79E] text-xs">
            Only the seller (@{handover?.seller?.username || listing?.seller?.username}) and winning buyer (@{handover?.buyer?.username || listing?.winner?.username}) can generate or verify the handover code.
          </p>
        </div>
      )}

      {/* Campus Exchange & Meeting Spot Link */}
      <div className="text-center border-t border-[#30372F] pt-5">
        <p className="text-xs text-[#747D72] mb-2">Need to coordinate a physical meeting spot on campus?</p>
        <Link
          to="/exchange"
          className="btn btn-secondary btn-sm py-2 px-4 text-xs text-[#C6FF4D] hover:bg-[#C6FF4D]/10 border-[#C6FF4D]/30 inline-flex items-center gap-1.5"
        >
          <span>🤝 Campus Exchange & Meeting Dashboard →</span>
        </Link>
      </div>
    </div>
  );
}
