import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listingsApi } from '../../api';
import ImageUpload from '../../components/ImageUpload';
import toast from 'react-hot-toast';
import { Info, Loader } from 'lucide-react';

const CATEGORIES = ['books', 'electronics', 'clothing', 'furniture', 'sports', 'other'];
const CONDITIONS  = ['new', 'like-new', 'good', 'fair'];
const DURATIONS   = [
  { label: '1 hour',   value: 1 },
  { label: '6 hours',  value: 6 },
  { label: '12 hours', value: 12 },
  { label: '1 day',    value: 24 },
  { label: '3 days',   value: 72 },
  { label: '7 days',   value: 168 },
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
  });

  const [selectedFiles, setSelectedFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

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
      formData.append('durationHours', String(form.durationHours));

      // Append image files under the "images" field name
      selectedFiles.forEach((file) => {
        formData.append('images', file);
      });

      const { data } = await listingsApi.create(formData);
      toast.success('Listing created successfully!');
      navigate(`/listings/${data.listing._id}`);
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
        <p className="text-slate-400">List your item for auction — upload clear photos from your device.</p>
      </div>

      {error && (
        <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl px-4 py-3 mb-6 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={submit} className="flex flex-col gap-6">
        {/* Item Details */}
        <div className="glass rounded-2xl p-6 flex flex-col gap-4">
          <h2 className="font-600 text-slate-200 text-lg mb-1">Item details</h2>

          {field('Title',
            <input
              id="listing-title"
              className="input"
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
              className="input min-h-28 resize-y"
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
                className="input"
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
                className="input"
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
        <div className="glass rounded-2xl p-6 flex flex-col gap-4">
          <h2 className="font-600 text-slate-200 text-lg mb-1">Pricing & duration</h2>

          <div className="grid grid-cols-2 gap-4">
            {field('Starting price (₹)',
              <input
                id="listing-start-price"
                type="number"
                className="input"
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
                className="input"
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
                className="input"
                min={1}
                disabled={loading}
                value={form.minBidIncrement}
                onChange={set('minBidIncrement')}
              />,
              'Minimum amount each bid must exceed current price'
            )}
            {field('Duration',
              <select
                id="listing-duration"
                className="input"
                disabled={loading}
                value={form.durationHours}
                onChange={(e) => setForm((f) => ({ ...f, durationHours: Number(e.target.value) }))}
              >
                {DURATIONS.map((d) => (
                  <option key={d.value} value={d.value}>{d.label}</option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* Image Upload Component */}
        <div className="glass rounded-2xl p-6">
          <ImageUpload
            newFiles={selectedFiles}
            onNewFilesChange={setSelectedFiles}
            maxImages={5}
            disabled={loading}
          />
        </div>

        {/* Submit */}
        <button
          id="create-listing-submit"
          type="submit"
          disabled={loading}
          className="btn btn-primary py-3.5 text-base flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <Loader size={18} className="animate-spin" />
              <span>Uploading & creating listing…</span>
            </>
          ) : (
            '🔨 Create Auction Listing'
          )}
        </button>
      </form>
    </div>
  );
}
