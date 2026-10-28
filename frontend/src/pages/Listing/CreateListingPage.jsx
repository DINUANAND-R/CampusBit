import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listingsApi } from '../../api';
import toast from 'react-hot-toast';
import { Plus, X, ImageIcon, Info } from 'lucide-react';

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
    title: '', description: '', category: 'books', condition: 'good',
    startingPrice: '', reservePrice: '', minBidIncrement: '10',
    durationHours: 24, images: [],
  });
  const [imageUrl, setImageUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const addImage = () => {
    if (!imageUrl.trim()) return;
    setForm((f) => ({ ...f, images: [...f.images, imageUrl.trim()] }));
    setImageUrl('');
  };

  const removeImage = (i) => setForm((f) => ({ ...f, images: f.images.filter((_, j) => j !== i) }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.title.trim() || !form.description.trim()) {
      setError('Title and description are required'); return;
    }
    if (Number(form.startingPrice) < 1) {
      setError('Starting price must be at least ₹1'); return;
    }
    setLoading(true);
    try {
      const { data } = await listingsApi.create({
        ...form,
        startingPrice: Number(form.startingPrice),
        reservePrice: form.reservePrice ? Number(form.reservePrice) : undefined,
        minBidIncrement: Number(form.minBidIncrement) || 10,
      });
      toast.success('Listing created!');
      navigate(`/listings/${data.listing._id}`);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create listing');
    } finally {
      setLoading(false);
    }
  };

  const field = (label, children, hint) => (
    <div>
      <label className="text-xs font-600 text-slate-300 uppercase tracking-wider mb-1.5 block">{label}</label>
      {children}
      {hint && <p className="text-slate-500 text-xs mt-1 flex items-center gap-1"><Info size={11} />{hint}</p>}
    </div>
  );

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="font-display font-700 text-3xl text-slate-100 mb-2">Create a listing</h1>
        <p className="text-slate-400">List your item for auction — bids are live and real-time.</p>
      </div>

      {error && (
        <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl px-4 py-3 mb-6 text-sm">{error}</div>
      )}

      <form onSubmit={submit} className="flex flex-col gap-6">
        {/* Basic info */}
        <div className="glass rounded-2xl p-6 flex flex-col gap-4">
          <h2 className="font-600 text-slate-200 text-lg mb-1">Item details</h2>

          {field('Title',
            <input id="listing-title" className="input" maxLength={120} required value={form.title} onChange={set('title')} placeholder="e.g. Calculus textbook 8th edition" />
          )}

          {field('Description',
            <textarea id="listing-desc" className="input min-h-28 resize-y" maxLength={2000} required value={form.description} onChange={set('description')} placeholder="Condition details, edition, included accessories…" />
          )}

          <div className="grid grid-cols-2 gap-4">
            {field('Category',
              <select id="listing-category" className="input" value={form.category} onChange={set('category')}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            )}
            {field('Condition',
              <select id="listing-condition" className="input" value={form.condition} onChange={set('condition')}>
                {CONDITIONS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            )}
          </div>
        </div>

        {/* Pricing */}
        <div className="glass rounded-2xl p-6 flex flex-col gap-4">
          <h2 className="font-600 text-slate-200 text-lg mb-1">Pricing & duration</h2>

          <div className="grid grid-cols-2 gap-4">
            {field('Starting price (₹)',
              <input id="listing-start-price" type="number" className="input" min={1} required value={form.startingPrice} onChange={set('startingPrice')} placeholder="e.g. 200" />
            )}
            {field('Reserve price (₹)',
              <input id="listing-reserve" type="number" className="input" min={1} value={form.reservePrice} onChange={set('reservePrice')} placeholder="Optional" />,
              'Item won\'t sell if bids don\'t reach this'
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            {field('Min bid increment (₹)',
              <input id="listing-increment" type="number" className="input" min={1} value={form.minBidIncrement} onChange={set('minBidIncrement')} />,
              'Minimum amount each bid must exceed the current price'
            )}
            {field('Duration',
              <select id="listing-duration" className="input" value={form.durationHours}
                onChange={(e) => setForm((f) => ({ ...f, durationHours: Number(e.target.value) }))}>
                {DURATIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
            )}
          </div>
        </div>

        {/* Images */}
        <div className="glass rounded-2xl p-6 flex flex-col gap-4">
          <h2 className="font-600 text-slate-200 text-lg mb-1">Images</h2>
          <div className="flex gap-2">
            <input id="listing-image-url" className="input text-sm" value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="Paste image URL (https://…)" />
            <button type="button" onClick={addImage} className="btn btn-secondary btn-sm shrink-0">
              <Plus size={15} /> Add
            </button>
          </div>
          {form.images.length > 0 && (
            <div className="grid grid-cols-3 gap-3">
              {form.images.map((url, i) => (
                <div key={i} className="relative group rounded-xl overflow-hidden h-24 bg-surface-700">
                  <img src={url} alt="" className="w-full h-full object-cover" onError={(e) => { e.target.style.display='none'; }} />
                  <button type="button" onClick={() => removeImage(i)}
                    className="absolute top-1 right-1 w-5 h-5 rounded-full bg-rose-500 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <X size={10} className="text-white" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <p className="text-slate-500 text-xs flex items-center gap-1">
            <ImageIcon size={11} /> Paste direct image URLs (imgur, cloudinary, etc.)
          </p>
        </div>

        <button id="create-listing-submit" type="submit" disabled={loading} className="btn btn-primary py-3.5 text-base">
          {loading ? 'Creating listing…' : '🔨 Create Auction Listing'}
        </button>
      </form>
    </div>
  );
}
