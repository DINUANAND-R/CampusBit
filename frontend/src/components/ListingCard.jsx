import { Link } from 'react-router-dom';
import Countdown from './Countdown';
import { Tag, TrendingUp } from 'lucide-react';

const conditionColors = {
  new:       'text-emerald-400 bg-emerald-400/10',
  'like-new':'text-brand-400 bg-brand-400/10',
  good:      'text-gold-400 bg-gold-400/10',
  fair:      'text-slate-400 bg-slate-400/10',
};

const categoryEmoji = {
  books: '📚', electronics: '💻', clothing: '👕',
  furniture: '🛋️', sports: '⚽', other: '📦',
};

export default function ListingCard({ listing }) {
  const {
    _id, title, category, condition,
    currentPrice, startingPrice, images,
    endsAt, status, seller,
  } = listing;

  const isActive = status === 'active';
  const hasBids  = currentPrice > startingPrice;

  return (
    <Link
      to={`/listings/${_id}`}
      id={`listing-card-${_id}`}
      className="glass rounded-2xl overflow-hidden card-hover group block"
    >
      {/* Image */}
      <div className="relative h-48 bg-surface-700 overflow-hidden">
        {images?.[0] ? (
          <img
            src={images[0]}
            alt={title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-5xl">
            {categoryEmoji[category] || '📦'}
          </div>
        )}
        {/* Status badge */}
        <div className="absolute top-3 left-3">
          {isActive ? (
            <span className="badge bg-emerald-400/20 text-emerald-400 border border-emerald-400/30">
              <span className="live-dot w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
              Live
            </span>
          ) : (
            <span className="badge bg-slate-500/20 text-slate-400 border border-slate-400/20">
              {status}
            </span>
          )}
        </div>
        {/* Condition */}
        <div className="absolute top-3 right-3">
          <span className={`badge ${conditionColors[condition] || ''}`}>
            {condition}
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="p-4 flex flex-col gap-3">
        {/* Category + seller */}
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span className="flex items-center gap-1">
            <Tag size={11} /> {category}
          </span>
          <span>@{seller?.username || 'unknown'}</span>
        </div>

        <h3 className="font-600 text-slate-100 leading-snug line-clamp-2">{title}</h3>

        {/* Price row */}
        <div className="flex items-end justify-between">
          <div>
            <p className="text-xs text-slate-500 mb-0.5">
              {hasBids ? 'Current bid' : 'Starting at'}
            </p>
            <p className="text-xl font-display font-700 gradient-text">
              ₹{currentPrice?.toLocaleString()}
            </p>
          </div>
          {hasBids && (
            <span className="flex items-center gap-1 text-xs text-gold-400">
              <TrendingUp size={12} /> Active bidding
            </span>
          )}
        </div>

        {/* Countdown */}
        {isActive && <Countdown endsAt={endsAt} />}
      </div>
    </Link>
  );
}
