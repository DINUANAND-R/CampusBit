import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { listingsApi, bidsApi } from '../../api';
import { useAuth } from '../../context/AuthContext';
import ImageUpload from '../../components/ImageUpload';
import VideoUpload from '../../components/VideoUpload';
import toast from 'react-hot-toast';
import { Info, Loader, ArrowLeft, Calendar, Clock, Lock } from 'lucide-react';

const CATEGORIES = ['books', 'electronics', 'clothing', 'furniture', 'sports', 'other'];
const CONDITIONS  = ['new', 'like-new', 'good', 'fair'];

export default function EditListingPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    title: '',
    description: '',
    category: 'books',
    condition: 'good',
    reservePrice: '',
    minBidIncrement: '10',
  });

  const [listingStatus, setListingStatus] = useState('active');
  const [scheduledAt, setScheduledAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [existingImages, setExistingImages] = useState([]);
  const [newFiles, setNewFiles] = useState([]);
  const [existingVideo, setExistingVideo] = useState(null);
  const [newVideoFile, setNewVideoFile] = useState(null);
  const [hadInitialVideo, setHadInitialVideo] = useState(false);
  const [hasBids, setHasBids] = useState(false);
  const [bidsCount, setBidsCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  // Helper to format ISO date to datetime-local input string
  const formatDatetimeLocal = (isoString) => {
    if (!isoString) return '';
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  // Load listing
  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      try {
        const [{ data: ld }, { data: bd }] = await Promise.all([
          listingsApi.getOne(id),
          bidsApi.history(id),
        ]);

        const listing = ld.listing;
        if (!isMounted) return;

        // Check ownership
        if (listing.seller?._id !== user?._id && user?.role !== 'admin') {
          toast.error('You are not authorized to edit this listing.');
          navigate(`/listings/${id}`);
          return;
        }

        // Check status: scheduled and active with 0 bids are editable
        if (listing.status !== 'active' && listing.status !== 'draft' && listing.status !== 'scheduled') {
          toast.error(`Cannot edit an auction with status: ${listing.status}`);
          navigate(`/listings/${id}`);
          return;
        }

        // Check bid count: track if bids exist to lock pricing while allowing other edits
        const bidsLength = bd.bids?.length || 0;
        if (bidsLength > 0) {
          setHasBids(true);
          setBidsCount(bidsLength);
        }

        setListingStatus(listing.status);
        if (listing.publishAt) {
          setScheduledAt(formatDatetimeLocal(listing.publishAt));
        }
        if (listing.endsAt) {
          setEndsAt(formatDatetimeLocal(listing.endsAt));
        }

        setForm({
          title: listing.title || '',
          description: listing.description || '',
          category: listing.category || 'books',
          condition: listing.condition || 'good',
          reservePrice: listing.reservePrice ? String(listing.reservePrice) : '',
          minBidIncrement: listing.minBidIncrement ? String(listing.minBidIncrement) : '10',
        });

        // Set existing images and video
        setExistingImages(listing.images || []);
        if (listing.video) {
          setExistingVideo(listing.video);
          setHadInitialVideo(true);
        }
      } catch (err) {
        toast.error('Failed to load listing for editing.');
        navigate('/dashboard');
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadData();
    return () => { isMounted = false; };
  }, [id, user, navigate]);

  const submit = async (e) => {
    e.preventDefault();
    if (saving) return;
    setError('');

    if (!form.title.trim() || !form.description.trim()) {
      setError('Title and description are required.');
      return;
    }

    const totalImages = existingImages.length + newFiles.length;
    if (totalImages < 1) {
      setError('At least one image is required.');
      return;
    }
    if (totalImages > 5) {
      setError('Maximum 5 images allowed.');
      return;
    }

    if (listingStatus === 'scheduled') {
      if (!scheduledAt) {
        setError('Scheduled publication date and time is required.');
        return;
      }
      const schedDate = new Date(scheduledAt);
      if (isNaN(schedDate.getTime()) || schedDate <= new Date()) {
        setError('Rescheduled publication time must be in the future.');
        return;
      }

      if (endsAt) {
        const endDate = new Date(endsAt);
        if (isNaN(endDate.getTime()) || endDate <= schedDate) {
          setError('Auction closing time must be strictly after the publication time.');
          return;
        }
      }
    }

    setSaving(true);

    try {
      const formData = new FormData();
      formData.append('title', form.title.trim());
      formData.append('description', form.description.trim());
      formData.append('category', form.category);
      formData.append('condition', form.condition);
      if (!hasBids) {
        if (form.reservePrice) {
          formData.append('reservePrice', String(Number(form.reservePrice)));
        } else {
          formData.append('reservePrice', '');
        }
        formData.append('minBidIncrement', String(Number(form.minBidIncrement) || 10));
      }

      if (listingStatus === 'scheduled' && scheduledAt) {
        formData.append('publishAt', new Date(scheduledAt).toISOString());
        if (endsAt) {
          formData.append('endsAt', new Date(endsAt).toISOString());
        }
      }

      // Pass retained existing images as JSON string
      formData.append('existingImages', JSON.stringify(existingImages));

      // Append new files under "images"
      newFiles.forEach((file) => {
        formData.append('images', file);
      });

      // Handle video replacement, removal, or retention
      if (newVideoFile) {
        formData.append('video', newVideoFile);
      } else if (hadInitialVideo && !existingVideo) {
        formData.append('removeVideo', 'true');
      }

      await listingsApi.update(id, formData);
      toast.success('Listing updated successfully!');
      navigate(listingStatus === 'scheduled' ? '/dashboard' : `/listings/${id}`);
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to update listing';
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const field = (label, children, hint) => (
    <div>
      <label className="text-xs font-600 text-slate-300 uppercase tracking-wider mb-1.5 block">
        {label}
      </label>
      {children}
      {hint && (
        <p className="text-slate-500 text-xs mt-1 flex items-center gap-1">
          <Info size={11} /> {hint}
        </p>
      )}
    </div>
  );

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <Loader size={32} className="animate-spin text-brand-400 mx-auto mb-3" />
        <p className="text-slate-400 text-sm">Loading listing details…</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <button
        onClick={() => navigate(listingStatus === 'scheduled' ? '/dashboard' : `/listings/${id}`)}
        className="flex items-center gap-2 text-slate-400 hover:text-slate-200 text-sm mb-6 transition-colors"
      >
        <ArrowLeft size={16} /> Back to {listingStatus === 'scheduled' ? 'dashboard' : 'listing'}
      </button>

      <div className="mb-8">
        <h1 className="font-display font-700 text-3xl text-slate-100 mb-2">Edit Product</h1>
        <p className="text-slate-400">
          {listingStatus === 'scheduled'
            ? 'Update your scheduled listing details, photos, video, or publication time.'
            : 'Update your product details, photos, and video.'}
        </p>
      </div>

      {hasBids && (
        <div className="bg-amber-500/10 border border-amber-500/20 text-amber-300 rounded-xl p-4 mb-6 text-xs flex items-start gap-2.5">
          <Lock size={16} className="text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="font-600 text-amber-200">Active Bidding In Progress ({bidsCount} {bidsCount === 1 ? 'bid' : 'bids'} placed)</p>
            <p className="text-amber-300/80 mt-0.5">
              Pricing terms are locked to protect current bidders. You can still update item title, description, category, condition, photos, and product video.
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl px-4 py-3 mb-6 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={submit} className="flex flex-col gap-6">
        {/* Item Details */}
        <div className="bg-[#1B201B] border border-[#30372F] rounded-2xl p-6 flex flex-col gap-4 shadow-lg">
          <h2 className="font-600 text-[#F4F5F0] text-lg mb-1">Item details</h2>

          {field('Title',
            <input
              id="edit-listing-title"
              className="input bg-[#151815] border-[#30372F] text-[#F4F5F0] focus:border-[#C6FF4D]"
              maxLength={120}
              required
              disabled={saving}
              value={form.title}
              onChange={set('title')}
            />
          )}

          {field('Description',
            <textarea
              id="edit-listing-desc"
              className="input min-h-28 resize-y bg-[#151815] border-[#30372F] text-[#F4F5F0] focus:border-[#C6FF4D]"
              maxLength={2000}
              required
              disabled={saving}
              value={form.description}
              onChange={set('description')}
            />
          )}

          <div className="grid grid-cols-2 gap-4">
            {field('Category',
              <select
                id="edit-listing-category"
                className="input bg-[#151815] border-[#30372F] text-[#F4F5F0] focus:border-[#C6FF4D]"
                disabled={saving}
                value={form.category}
                onChange={set('category')}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            )}
            {field('Condition',
              <select
                id="edit-listing-condition"
                className="input bg-[#151815] border-[#30372F] text-[#F4F5F0] focus:border-[#C6FF4D]"
                disabled={saving}
                value={form.condition}
                onChange={set('condition')}
              >
                {CONDITIONS.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* Reschedule publication (only if scheduled) */}
        {listingStatus === 'scheduled' && (
          <div className="bg-[#1B201B] rounded-2xl p-6 flex flex-col gap-4 border border-[#C6FF4D]/30 shadow-lg">
            <div className="flex items-center gap-2 text-[#C6FF4D]">
              <Calendar size={18} />
              <h2 className="font-600 text-[#F4F5F0] text-lg">Scheduled publication time</h2>
            </div>
            <p className="text-[#A1A79E] text-xs">
              This auction is scheduled to go live automatically. You can choose a new future date and time.
            </p>
            <div className="grid sm:grid-cols-2 gap-4">
              {field('Publication Date & Time',
                <input
                  id="edit-listing-publish-at"
                  type="datetime-local"
                  className="input bg-[#151815] border-[#30372F] text-[#F4F5F0] focus:border-[#C6FF4D]"
                  required
                  disabled={saving}
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                />,
                'When the auction will go live'
              )}
              {field('Auction Closing Date & Time',
                <input
                  id="edit-listing-ends-at"
                  type="datetime-local"
                  className="input bg-[#151815] border-[#30372F] text-[#F4F5F0] focus:border-[#C6FF4D]"
                  disabled={saving}
                  value={endsAt}
                  min={scheduledAt}
                  onChange={(e) => setEndsAt(e.target.value)}
                />,
                'Must be strictly after publication time'
              )}
            </div>
          </div>
        )}

        {/* Pricing Options */}
        <div className="bg-[#1B201B] border border-[#30372F] rounded-2xl p-6 flex flex-col gap-4 shadow-lg">
          <h2 className="font-600 text-[#F4F5F0] text-lg mb-1">Pricing options</h2>

          <div className="grid grid-cols-2 gap-4">
            {field('Reserve price (₹)',
              <div className="relative">
                <input
                  id="edit-listing-reserve"
                  type="number"
                  className={`input bg-[#151815] border-[#30372F] text-[#F4F5F0] focus:border-[#C6FF4D] tabular-nums ${hasBids ? 'opacity-50 cursor-not-allowed bg-[#101211]' : ''}`}
                  min={1}
                  disabled={saving || hasBids}
                  value={form.reservePrice}
                  onChange={set('reservePrice')}
                  placeholder={hasBids ? 'Locked' : 'Optional'}
                />
                {hasBids && (
                  <Lock size={14} className="absolute right-3 top-3 text-[#747D72]" />
                )}
              </div>,
              hasBids ? 'Locked: active bidding in progress' : "Item won't sell if bids don't reach this"
            )}
            {field('Min bid increment (₹)',
              <div className="relative">
                <input
                  id="edit-listing-increment"
                  type="number"
                  className={`input bg-[#151815] border-[#30372F] text-[#F4F5F0] focus:border-[#C6FF4D] tabular-nums ${hasBids ? 'opacity-50 cursor-not-allowed bg-[#101211]' : ''}`}
                  min={1}
                  disabled={saving || hasBids}
                  value={form.minBidIncrement}
                  onChange={set('minBidIncrement')}
                />
                {hasBids && (
                  <Lock size={14} className="absolute right-3 top-3 text-[#747D72]" />
                )}
              </div>,
              hasBids ? 'Locked: active bidding in progress' : 'Minimum amount each bid must exceed current price'
            )}
          </div>
        </div>

        {/* Image Management */}
        <div className="bg-[#1B201B] border border-[#30372F] rounded-2xl p-6 shadow-lg">
          <ImageUpload
            existingImages={existingImages}
            onExistingImagesChange={setExistingImages}
            newFiles={newFiles}
            onNewFilesChange={setNewFiles}
            maxImages={5}
            disabled={saving}
          />
        </div>

        {/* Product Video Management (Optional) */}
        <div className="bg-[#1B201B] border border-[#30372F] rounded-2xl p-6 shadow-lg">
          <VideoUpload
            existingVideo={existingVideo}
            onExistingVideoChange={setExistingVideo}
            selectedFile={newVideoFile}
            onFileChange={setNewVideoFile}
            disabled={saving}
          />
        </div>

        {/* Save button */}
        <button
          id="edit-listing-submit"
          type="submit"
          disabled={saving}
          className="btn btn-primary py-3.5 text-base flex items-center justify-center gap-2"
        >
          {saving ? (
            <>
              <Loader size={18} className="animate-spin" />
              <span>Saving changes…</span>
            </>
          ) : (
            '💾 Save Changes'
          )}
        </button>
      </form>
    </div>
  );
}
