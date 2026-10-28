import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { handoverApi, listingsApi } from '../../api';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';
import { CheckCircle, XCircle, Key, Package, Loader } from 'lucide-react';

export default function HandoverPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [listing,  setListing]  = useState(null);
  const [handover, setHandover] = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [otp,      setOtp]      = useState('');
  const [reason,   setReason]   = useState('');
  const [acting,   setActing]   = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [{ data: ld }, { data: hd }] = await Promise.all([
        listingsApi.getOne(id),
        handoverApi.get(id),
      ]);
      setListing(ld.listing);
      setHandover(hd.handover);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load handover');
      navigate('/dashboard');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]);

  const isSeller = user?._id === listing?.seller?._id || user?._id === handover?.seller?._id;
  const isBuyer  = user?._id === handover?.buyer?._id;

  const approve = async () => {
    setActing(true);
    try {
      const { data } = await handoverApi.approve(id);
      toast.success(`Approved! Your handover code: ${data.handoverCode}`);
      await load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error');
    } finally {
      setActing(false);
    }
  };

  const reject = async () => {
    if (!reason.trim()) { toast.error('Please provide a reason'); return; }
    setActing(true);
    try {
      await handoverApi.reject(id, reason);
      toast.success('Rejected — item marked as unsold');
      await load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error');
    } finally {
      setActing(false);
    }
  };

  const confirm = async () => {
    if (!otp.trim()) { toast.error('Enter the handover code'); return; }
    setActing(true);
    try {
      await handoverApi.confirm(id, otp);
      toast.success('🎉 Handover complete!');
      await load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Invalid code');
    } finally {
      setActing(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-lg mx-auto px-4 py-20 text-center">
        <Loader size={32} className="animate-spin text-brand-400 mx-auto" />
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-8 text-[#F4F5F0]">
      <h1 className="font-display font-700 text-2xl text-[#F4F5F0] mb-2">Handover</h1>
      <p className="text-[#A1A79E] text-sm mb-8">
        Auction: <span className="text-[#F4F5F0] font-600">{listing?.title}</span>
      </p>

      {/* Summary card */}
      <div className="bg-[#1B201B] border border-[#30372F] rounded-2xl p-6 mb-6 flex flex-col gap-3 shadow-lg">
        <div className="flex justify-between text-sm">
          <span className="text-[#A1A79E]">Final price</span>
          <span className="font-display font-800 text-[#C6FF4D] text-lg tabular-nums">₹{handover?.finalPrice?.toLocaleString()}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-[#A1A79E]">Seller</span>
          <span className="text-[#F4F5F0]">@{handover?.seller?.username}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-[#A1A79E]">Buyer (winner)</span>
          <span className="text-[#F4F5F0]">@{handover?.buyer?.username}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-[#A1A79E]">Status</span>
          <span className={`font-600 capitalize ${
            handover?.sellerDecision === 'approved' ? 'text-[#65D99A]' :
            handover?.sellerDecision === 'rejected' ? 'text-[#FF7373]' : 'text-[#FFC857]'
          }`}>
            {handover?.completedAt ? '✅ Completed' : handover?.sellerDecision}
          </span>
        </div>
      </div>

      {/* ── Seller view ──────────────────────────────────────────────────── */}
      {isSeller && handover?.sellerDecision === 'pending' && (
        <div className="bg-[#1B201B] border border-[#30372F] rounded-2xl p-6 flex flex-col gap-4 shadow-lg">
          <h2 className="font-600 text-[#F4F5F0]">Seller decision</h2>
          <p className="text-[#A1A79E] text-sm">
            The buyer won your item for <strong className="text-[#F4F5F0] tabular-nums">₹{handover?.finalPrice?.toLocaleString()}</strong>.
            Approve to generate the handover code, or reject if you can't proceed.
          </p>
          <div className="flex gap-3">
            <button id="approve-btn" onClick={approve} disabled={acting} className="btn btn-success flex-1">
              <CheckCircle size={16} /> Approve
            </button>
            <button id="reject-btn" onClick={() => {}} className="btn btn-danger flex-1"
              disabled={acting}>
              <XCircle size={16} /> Reject
            </button>
          </div>
          {/* Rejection reason */}
          <div>
            <label className="text-xs text-[#A1A79E] uppercase tracking-wider mb-1 block">Rejection reason (required to reject)</label>
            <input className="input text-sm bg-[#151815] border-[#30372F] text-[#F4F5F0]" value={reason} onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Item damaged, buyer unreachable…" />
            <button id="confirm-reject-btn" onClick={reject} disabled={acting || !reason.trim()}
              className="btn btn-danger btn-sm mt-2 w-full">
              Confirm rejection
            </button>
          </div>
        </div>
      )}

      {isSeller && handover?.sellerDecision === 'approved' && !handover?.completedAt && (
        <div className="bg-[#1B201B] border border-[#30372F] rounded-2xl p-6 flex flex-col gap-3 shadow-lg">
          <h2 className="font-600 text-[#65D99A] flex items-center gap-2"><Key size={18} /> Your handover code</h2>
          <p className="text-[#A1A79E] text-sm">Share this code with the buyer to confirm item handover.</p>
          <div className="text-center bg-[#151815] rounded-xl py-6 border border-[#C6FF4D]/30">
            <span className="font-mono font-800 text-4xl tracking-widest text-[#C6FF4D] tabular-nums">
              {handover.handoverCode}
            </span>
          </div>
        </div>
      )}

      {/* ── Buyer view ───────────────────────────────────────────────────── */}
      {isBuyer && handover?.sellerDecision === 'approved' && !handover?.completedAt && (
        <div className="bg-[#1B201B] border border-[#30372F] rounded-2xl p-6 flex flex-col gap-4 shadow-lg">
          <h2 className="font-600 text-[#F4F5F0] flex items-center gap-2"><Key size={18} /> Enter handover code</h2>
          <p className="text-[#A1A79E] text-sm">
            The seller has approved. Get the 6-digit code from them and enter it below to confirm you've received the item.
          </p>
          <input
            id="otp-input"
            className="input text-center font-mono text-2xl tracking-widest py-4 bg-[#151815] border-[#30372F] text-[#C6FF4D] tabular-nums"
            maxLength={6}
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
            placeholder="000000"
          />
          <button id="confirm-otp-btn" onClick={confirm} disabled={acting || otp.length !== 6}
            className="btn btn-success w-full py-3">
            <CheckCircle size={16} /> Confirm handover
          </button>
        </div>
      )}

      {/* Completed */}
      {handover?.completedAt && (
        <div className="bg-[#1B201B] border border-[#30372F] rounded-2xl p-6 text-center shadow-lg">
          <CheckCircle size={48} className="text-[#65D99A] mx-auto mb-3" />
          <h2 className="font-700 text-xl text-[#65D99A] mb-2">Handover complete!</h2>
          <p className="text-[#A1A79E] text-sm">
            Completed on {new Date(handover.completedAt).toLocaleString()}
          </p>
        </div>
      )}

      {/* Rejected */}
      {handover?.sellerDecision === 'rejected' && (
        <div className="bg-[#1B201B] border border-[#30372F] rounded-2xl p-6 text-center shadow-lg">
          <XCircle size={48} className="text-[#FF7373] mx-auto mb-3" />
          <h2 className="font-700 text-xl text-[#FF7373] mb-2">Handover rejected</h2>
          <p className="text-[#A1A79E] text-sm">{handover.rejectionReason || 'The seller rejected this handover.'}</p>
        </div>
      )}

      {/* Waiting for seller */}
      {handover?.sellerDecision === 'pending' && !isSeller && (
        <div className="bg-[#1B201B] border border-[#30372F] rounded-2xl p-6 text-center shadow-lg">
          <Package size={48} className="text-[#FFC857] mx-auto mb-3" />
          <h2 className="font-700 text-xl text-[#FFC857] mb-2">Awaiting seller decision</h2>
          <p className="text-[#A1A79E] text-sm">The seller needs to approve before handover can proceed.</p>
        </div>
      )}
    </div>
  );
}
