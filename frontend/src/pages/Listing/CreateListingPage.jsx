import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listingsApi } from '../../api';
import ImageUpload from '../../components/ImageUpload';
import VideoUpload from '../../components/VideoUpload';
import toast from 'react-hot-toast';
import { Info, Loader, Calendar, Clock, Zap } from 'lucide-react';

const CATEGORIES = ['books', 'electronics', 'clothing', 'furniture', 'sports', 'other'];
const CONDITIONS  = ['new', 'like-new', 'good', 'fair'];
const DURATIONS = [
  // Fast & Flash sales in minutes
  { label: '⚡ 2 minutes (Quick test / flash auction)', value: 2 / 60, minutes: 2 },
  { label: '⚡ 5 minutes (Flash auction)', value: 5 / 60, minutes: 5 },
  { label: '⚡ 10 minutes (Quick campus deal)', value: 10 / 60, minutes: 10 },
  { label: '⚡ 15 minutes', value: 15 / 60, minutes: 15 },
  { label: '⚡ 30 minutes', value: 30 / 60, minutes: 30 },
  // Standard hours & days
  { label: '1 hour', value: 1, minutes: 60 },
  { label: '6 hours', value: 6, minutes: 360 },
  { label: '12 hours', value: 12, minutes: 720 },
  { label: '1 day (24 hours)', value: 24, minutes: 1440 },
  { label: '3 days', value: 72, minutes: 4320 },
  { label: '7 days', value: 168, minutes: 10080 },
];

export default function CreateListingPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    title: '',
    description: '',
    category: 'books',
    condition: 'good',
    startingPrice: '',
    reservePrice: '',
    minBidIncrement: '10',
    durationHours: 24,
    customMinutes: '',
    customEndsAt: '',
  });

  const [publishType, setPublishType] = useState('now'); // 'now' | 'later'
  const [scheduledAt, setScheduledAt] = useState('');
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  // Helper to set preset time in minutes from now
  const setMinutePreset = (mins) => {
    const d = new Date(Date.now() + mins * 60 * 1000);
    const pad = (n) => String(n).padStart(2, '0');
    const formatted = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    setScheduledAt(formatted);
  };

  // Helper to set preset time for tomorrow
  const setTomorrowPreset = (hour) => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(hour, 0, 0, 0);
    // Format to YYYY-MM-DDTHH:mm
    const pad = (n) => String(n).padStart(2, '0');
    const formatted = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    setScheduledAt(formatted);
  };

  // Calculate preview times
  const getSchedulePreviews = () => {
    let start;
    if (publishType === 'now') {
      start = new Date();
    } else {
      if (!scheduledAt) return null;
      start = new Date(scheduledAt);
      if (isNaN(start.getTime())) return null;
    }

    let end;
    let durationLabel = '';
    if (form.durationHours === 'custom') {
      if (!form.customEndsAt) return {
        startText: publishType === 'now' ? 'Immediately upon creation' : start.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }),
        endText: 'Please select custom end time',
        valid: false,
      };
      end = new Date(form.customEndsAt);
    } else if (form.durationHours === 'customMinutes') {
      const mins = Math.max(1, Number(form.customMinutes) || 5);
      end = new Date(start.getTime() + mins * 60 * 1000);
      durationLabel = ` (${mins} min${mins === 1 ? '' : 's'})`;
    } else {
      const match = DURATIONS.find((d) => d.value === form.durationHours);
      if (match && match.minutes && match.minutes < 60) {
        end = new Date(start.getTime() + match.minutes * 60 * 1000);
        durationLabel = ` (${match.minutes} mins)`;
      } else {
        const hours = typeof form.durationHours === 'number' ? form.durationHours : 24;
        end = new Date(start.getTime() + hours * 60 * 60 * 1000);
        durationLabel = hours < 1 ? ` (${Math.round(hours * 60)} mins)` : ` (${hours} hr${hours === 1 ? '' : 's'})`;
      }
    }

    const isStartValid = publishType === 'now' ? true : start > new Date();
    const isEndValid = end > start;

    return {
      startText: publishType === 'now' ? 'Immediately upon creation' : start.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }),
      endText: isNaN(end.getTime()) ? 'Invalid date' : `${end.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'medium' })}${durationLabel}`,
      valid: isStartValid && isEndValid,
      startValid: isStartValid,
      endValid: isEndValid,
    };
  };

  const preview = getSchedulePreviews();

  // Get current time formatted for min attribute on input
  const getMinDatetime = () => {
    const d = new Date();
    d.setMinutes(d.getMinutes() + 2); // At least 2 minutes in future
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const submit = async (e) => {
    e.preventDefault();
    if (loading) return; // Prevent duplicate submissions
    setError('');

    if (!form.title.trim() || !form.description.trim()) {
      setError('Title and description are required.');
      return;
    }
    if (Number(form.startingPrice) < 1) {
      setError('Starting price must be at least ₹1.');
      return;
    }
    if (selectedFiles.length === 0) {
      setError('Please upload at least one photo of the item.');
      return;
    }
    if (selectedFiles.length > 5) {
      setError('A maximum of 5 photos is allowed.');
      return;
    }

    if (publishType === 'later') {
      if (!scheduledAt) {
        setError('Please select a scheduled publication date and time.');
        return;
      }
      const schedDate = new Date(scheduledAt);
      if (isNaN(schedDate.getTime()) || schedDate <= new Date()) {
        setError('Scheduled publication time must be a future date and time.');
        return;
      }
    }

    const startTime = publishType === 'later' ? new Date(scheduledAt) : new Date();

    if (form.durationHours === 'custom') {
      if (!form.customEndsAt) {
        setError('Please select a custom auction closing time.');
        return;
      }
      const customEnd = new Date(form.customEndsAt);
      if (isNaN(customEnd.getTime())) {
        setError('Invalid auction closing time.');
        return;
      }
      if (customEnd <= startTime) {
        setError('Auction closing time must be strictly after the scheduled publication time.');
        return;
      }
    } else if (form.durationHours === 'customMinutes') {
      const mins = Number(form.customMinutes);
      if (!mins || mins < 1) {
        setError('Please enter a valid auction duration of at least 1 minute.');
        return;
      }
    }

    setLoading(true);

    try {
      // Build multipart/form-data payload
      const formData = new FormData();
      formData.append('title', form.title.trim());
      formData.append('description', form.description.trim());
      formData.append('category', form.category);
      formData.append('condition', form.condition);
      formData.append('startingPrice', String(Number(form.startingPrice)));
      if (form.reservePrice) {
        formData.append('reservePrice', String(Number(form.reservePrice)));
      }
      formData.append('minBidIncrement', String(Number(form.minBidIncrement) || 10));
      formData.append('publishType', publishType);

      if (form.durationHours === 'custom') {
        formData.append('endsAt', new Date(form.customEndsAt).toISOString());
      } else if (form.durationHours === 'customMinutes') {
        const mins = Math.max(1, Number(form.customMinutes) || 5);
        formData.append('durationMinutes', String(mins));
        formData.append('endsAt', new Date(startTime.getTime() + mins * 60 * 1000).toISOString());
      } else {
        const match = DURATIONS.find((d) => d.value === form.durationHours);
        if (match && match.minutes && match.minutes < 60) {
          formData.append('durationMinutes', String(match.minutes));
          formData.append('endsAt', new Date(startTime.getTime() + match.minutes * 60 * 1000).toISOString());
        } else {
          formData.append('durationHours', String(form.durationHours));
          const hours = Number(form.durationHours) || 24;
          formData.append('endsAt', new Date(startTime.getTime() + hours * 60 * 60 * 1000).toISOString());
        }
      }

      if (publishType === 'later') {
        formData.append('publishAt', new Date(scheduledAt).toISOString());
      }

      // Append image files under the "images" field name
      selectedFiles.forEach((file) => {
        formData.append('images', file);
      });

      // Append optional video file under the "video" field name
      if (selectedVideo) {
        formData.append('video', selectedVideo);
      }

      const { data } = await listingsApi.create(formData);
      const isSched = data.listing?.status === 'scheduled';
      toast.success(isSched ? 'Listing scheduled successfully!' : 'Listing published live!');
      navigate(isSched ? '/dashboard' : `/listings/${data.listing._id}`);
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to create listing';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
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

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="font-display font-700 text-3xl text-slate-100 mb-2">Create a listing</h1>
        <p className="text-slate-400">List your item for auction — publish immediately or schedule for a future date.</p>
      </div>

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
              id="listing-title"
              className="input bg-[#151815] border-[#30372F] text-[#F4F5F0] focus:border-[#C6FF4D]"
              maxLength={120}
              required
              disabled={loading}
              value={form.title}
              onChange={set('title')}
              placeholder="e.g. Calculus textbook 8th edition"
            />
          )}

          {field('Description',
            <textarea
              id="listing-desc"
              className="input min-h-28 resize-y bg-[#151815] border-[#30372F] text-[#F4F5F0] focus:border-[#C6FF4D]"
              maxLength={2000}
              required
              disabled={loading}
              value={form.description}
              onChange={set('description')}
              placeholder="Condition details, edition, included accessories…"
            />
          )}

          <div className="grid grid-cols-2 gap-4">
            {field('Category',
              <select
                id="listing-category"
                className="input bg-[#151815] border-[#30372F] text-[#F4F5F0] focus:border-[#C6FF4D]"
                disabled={loading}
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
                id="listing-condition"
                className="input bg-[#151815] border-[#30372F] text-[#F4F5F0] focus:border-[#C6FF4D]"
                disabled={loading}
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

        {/* Pricing & Duration */}
        <div className="bg-[#1B201B] border border-[#30372F] rounded-2xl p-6 flex flex-col gap-4 shadow-lg">
          <h2 className="font-600 text-[#F4F5F0] text-lg mb-1">Pricing & duration</h2>

          <div className="grid grid-cols-2 gap-4">
            {field('Starting price (₹)',
              <input
                id="listing-start-price"
                type="number"
                className="input bg-[#151815] border-[#30372F] text-[#F4F5F0] focus:border-[#C6FF4D] tabular-nums"
                min={1}
                required
                disabled={loading}
                value={form.startingPrice}
                onChange={set('startingPrice')}
                placeholder="e.g. 200"
              />
            )}
            {field('Reserve price (₹)',
              <input
                id="listing-reserve"
                type="number"
                className="input bg-[#151815] border-[#30372F] text-[#F4F5F0] focus:border-[#C6FF4D] tabular-nums"
                min={1}
                disabled={loading}
                value={form.reservePrice}
                onChange={set('reservePrice')}
                placeholder="Optional"
              />,
              "Item won't sell if bids don't reach this"
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            {field('Min bid increment (₹)',
              <input
                id="listing-increment"
                type="number"
                className="input bg-[#151815] border-[#30372F] text-[#F4F5F0] focus:border-[#C6FF4D] tabular-nums"
                min={1}
                disabled={loading}
                value={form.minBidIncrement}
                onChange={set('minBidIncrement')}
              />,
              'Minimum amount each bid must exceed current price'
            )}
            {field('Auction Duration / End Time',
              <select
                id="listing-duration"
                className="input bg-[#151815] border-[#30372F] text-[#F4F5F0] focus:border-[#C6FF4D]"
                disabled={loading}
                value={form.durationHours}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    durationHours: e.target.value === 'custom' || e.target.value === 'customMinutes'
                      ? e.target.value
                      : Number(e.target.value),
                  }))
                }
              >
                <optgroup label="⚡ Quick Minute Auctions (Flash Sales)">
                  {DURATIONS.filter((d) => d.minutes < 60).map((d) => (
                    <option key={d.value} value={d.value}>{d.label}</option>
                  ))}
                  <option value="customMinutes">⏱️ Custom duration in minutes…</option>
                </optgroup>
                <optgroup label="Standard Hours & Days">
                  {DURATIONS.filter((d) => d.minutes >= 60).map((d) => (
                    <option key={d.value} value={d.value}>{d.label}</option>
                  ))}
                  <option value="custom">📅 Custom end date & time…</option>
                </optgroup>
              </select>,
              'Time the auction will stay open for bidding once live'
            )}
          </div>

          {form.durationHours === 'customMinutes' && (
            <div className="pt-2 animate-fade-in flex flex-col gap-2">
              <label className="text-xs font-600 text-[#A1A79E] uppercase tracking-wider block">
                ⚡ Flash Auction Duration in Minutes (1 – 1440 mins)
              </label>
              <div className="flex items-center gap-3">
                <div className="relative flex-1 max-w-[200px]">
                  <input
                    id="listing-custom-minutes-input"
                    type="number"
                    min="1"
                    max="1440"
                    placeholder="e.g. 3"
                    value={form.customMinutes}
                    onChange={set('customMinutes')}
                    className="input bg-[#151815] border-[#30372F] text-[#F4F5F0] focus:border-[#C6FF4D] tabular-nums pr-12"
                    required
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#747D72]">mins</span>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {[1, 2, 3, 5, 10, 15, 20, 30, 45].map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, customMinutes: String(m) }))}
                      className={`btn btn-secondary btn-sm py-1 px-2.5 text-xs transition-all ${
                        String(form.customMinutes) === String(m)
                          ? 'border-[#C6FF4D] text-[#C6FF4D] bg-[#C6FF4D]/10 font-600'
                          : 'text-[#A1A79E] hover:text-[#F4F5F0]'
                      }`}
                    >
                      {m}m
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-[#747D72] text-xs">
                The auction will stay open for exactly this many minutes from start to finish.
              </p>
            </div>
          )}

          {form.durationHours === 'custom' && (
            <div className="pt-2 animate-fade-in">
              {field('Custom Auction Closing Date & Time',
                <input
                  id="listing-custom-end-input"
                  type="datetime-local"
                  min={publishType === 'later' && scheduledAt ? scheduledAt : getMinDatetime()}
                  value={form.customEndsAt}
                  onChange={set('customEndsAt')}
                  className="input bg-[#151815] border-[#30372F] text-[#F4F5F0] focus:border-[#C6FF4D]"
                  required
                />,
                'Must be strictly after the publication date and time'
              )}
            </div>
          )}
        </div>

        {/* Publication Options: Publish Now vs Schedule */}
        <div className="bg-[#1B201B] border border-[#30372F] rounded-2xl p-6 flex flex-col gap-4 shadow-lg">
          <h2 className="font-600 text-[#F4F5F0] text-lg mb-1">Publication schedule</h2>

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              id="publish-now-btn"
              onClick={() => setPublishType('now')}
              className={`p-4 rounded-xl border text-left transition-all flex items-start gap-3 ${
                publishType === 'now'
                  ? 'border-[#C6FF4D] bg-[#C6FF4D]/10 ring-1 ring-[#C6FF4D]/40 text-[#F4F5F0]'
                  : 'border-[#30372F] bg-[#151815] text-[#A1A79E] hover:border-[#C6FF4D]/40'
              }`}
            >
              <Zap size={20} className={publishType === 'now' ? 'text-[#C6FF4D]' : 'text-[#747D72]'} />
              <div>
                <p className="font-600 text-sm">Publish Now</p>
                <p className="text-xs text-[#A1A79E] mt-0.5">Auction starts immediately after creation</p>
              </div>
            </button>

            <button
              type="button"
              id="schedule-later-btn"
              onClick={() => {
                setPublishType('later');
                if (!scheduledAt) setTomorrowPreset(9); // Default to tomorrow 9 AM
              }}
              className={`p-4 rounded-xl border text-left transition-all flex items-start gap-3 ${
                publishType === 'later'
                  ? 'border-[#C6FF4D] bg-[#C6FF4D]/10 ring-1 ring-[#C6FF4D]/40 text-[#F4F5F0]'
                  : 'border-[#30372F] bg-[#151815] text-[#A1A79E] hover:border-[#C6FF4D]/40'
              }`}
            >
              <Calendar size={20} className={publishType === 'later' ? 'text-[#C6FF4D]' : 'text-[#747D72]'} />
              <div>
                <p className="font-600 text-sm">Schedule for Later</p>
                <p className="text-xs text-[#A1A79E] mt-0.5">Choose a future date and time to go live</p>
              </div>
            </button>
          </div>

          {publishType === 'later' && (
            <div className="flex flex-col gap-3 pt-2 animate-fade-in">
              <label className="text-xs font-600 text-[#A1A79E] uppercase tracking-wider block">
                Select Publication Date & Time
              </label>

              <input
                id="schedule-datetime-input"
                type="datetime-local"
                min={getMinDatetime()}
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className="input bg-[#151815] border-[#30372F] text-[#F4F5F0] focus:border-[#C6FF4D]"
                required={publishType === 'later'}
              />

              {/* Quick presets */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-[#747D72]">Go live presets:</span>
                <button
                  type="button"
                  onClick={() => setMinutePreset(2)}
                  className="btn btn-secondary btn-sm py-1 px-2.5 text-xs text-[#C6FF4D] hover:bg-[#C6FF4D]/10 border-[#C6FF4D]/30"
                >
                  ⚡ In 2 mins
                </button>
                <button
                  type="button"
                  onClick={() => setMinutePreset(5)}
                  className="btn btn-secondary btn-sm py-1 px-2.5 text-xs text-[#C6FF4D] hover:bg-[#C6FF4D]/10 border-[#C6FF4D]/30"
                >
                  ⚡ In 5 mins
                </button>
                <button
                  type="button"
                  onClick={() => setMinutePreset(15)}
                  className="btn btn-secondary btn-sm py-1 px-2.5 text-xs text-[#C6FF4D] hover:bg-[#C6FF4D]/10 border-[#C6FF4D]/30"
                >
                  ⚡ In 15 mins
                </button>
                <button
                  type="button"
                  onClick={() => setMinutePreset(30)}
                  className="btn btn-secondary btn-sm py-1 px-2.5 text-xs text-[#C6FF4D] hover:bg-[#C6FF4D]/10 border-[#C6FF4D]/30"
                >
                  ⚡ In 30 mins
                </button>
                <button
                  type="button"
                  onClick={() => setTomorrowPreset(9)}
                  className="btn btn-secondary btn-sm py-1 px-2.5 text-xs text-[#A1A79E] hover:text-[#F4F5F0]"
                >
                  Tomorrow 9 AM
                </button>
                <button
                  type="button"
                  onClick={() => setTomorrowPreset(18)}
                  className="btn btn-secondary btn-sm py-1 px-2.5 text-xs text-[#A1A79E] hover:text-[#F4F5F0]"
                >
                  Tomorrow 6 PM
                </button>
              </div>
            </div>
          )}

          {/* Schedule Preview Banner */}
          {preview && (
            <div className="bg-[#151815] border border-[#30372F] rounded-xl p-3.5 flex flex-col gap-1 text-xs text-[#A1A79E]">
              <div className="flex items-center gap-2">
                <Clock size={14} className="text-[#C6FF4D]" />
                <span>
                  <strong className="text-[#F4F5F0]">Goes Live:</strong> {preview.startText}
                </span>
              </div>
              <div className="flex items-center gap-2 text-[#747D72]">
                <span className="w-3.5" />
                <span>
                  <strong className="text-[#A1A79E]">Auction Closes:</strong> {preview.endText}
                </span>
              </div>
              {publishType === 'later' && preview.valid === false && (
                <p className="text-[#FF7373] font-600 mt-1">
                  ⚠️ Publication time must be in the future.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Image Upload Component */}
        <div className="bg-[#1B201B] border border-[#30372F] rounded-2xl p-6 shadow-lg">
          <ImageUpload
            newFiles={selectedFiles}
            onNewFilesChange={setSelectedFiles}
            maxImages={5}
            disabled={loading}
          />
        </div>

        {/* Product Video Upload Component (Optional) */}
        <div className="bg-[#1B201B] border border-[#30372F] rounded-2xl p-6 shadow-lg">
          <VideoUpload
            selectedFile={selectedVideo}
            onFileChange={setSelectedVideo}
            disabled={loading}
          />
        </div>

        {/* Submit */}
        <button
          id="create-listing-submit"
          type="submit"
          disabled={loading || (publishType === 'later' && (!scheduledAt || (preview && !preview.valid)))}
          className="btn btn-primary py-3.5 text-base flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <Loader size={18} className="animate-spin" />
              <span>{publishType === 'later' ? 'Scheduling listing…' : 'Uploading & creating listing…'}</span>
            </>
          ) : publishType === 'later' ? (
            '📅 Schedule Auction Listing'
          ) : (
            '🔨 Publish Auction Now'
          )}
        </button>
      </form>
    </div>
  );
}
