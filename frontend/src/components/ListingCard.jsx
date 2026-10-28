import { Link } from 'react-router-dom';
import Countdown from './Countdown';
import { Tag, TrendingUp, Video, ArrowUpRight } from 'lucide-react';
import { getImageUrl, FALLBACK_IMAGE } from '../utils/imageUrl';

const conditionStyles = {
  new: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/25',
  'like-new': 'text-brand-400 bg-brand-400/10 border-brand-400/25',
  good: 'text-amber-400 bg-amber-400/10 border-amber-400/25',
  fair: 'text-slate-400 bg-slate-400/10 border-slate-400/25',
};

export default function ListingCard({ listing }) {
  if (!listing) return null;

  const {
    _id,
    title,
    category,
    condition,
    currentPrice,
    startingPrice,
    images,
    video,
    endsAt,
    status,
    seller,
  } = listing;

  const isActive = status === 'active';
  const hasBids = currentPrice > startingPrice;
  const coverUrl = images?.[0] ? getImageUrl(images[0]) : null;
  const hasVideo = Boolean(video && (video.url || video.filename));

  return (
    <Link
      to={`/listings/${_id}`}
      id={`listing-card-${_id}`}
      className="bg-[#1B201B] border border-[#30372F] rounded-xl overflow-hidden card-hover group flex flex-col justify-between focus:outline-none focus:ring-2 focus:ring-[#C6FF4D]/40"
    >
      <div>
        {/* Media Container with Consistent Aspect Ratio */}
        <div className="relative aspect-[4/3] w-full bg-[#151815] overflow-hidden">
          <img
            src={coverUrl || FALLBACK_IMAGE}
            alt={title}
            loading="lazy"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 ease-out"
            onError={(e) => {
              e.currentTarget.src = FALLBACK_IMAGE;
            }}
          />

          {/* Video Indicator Chip */}
          {hasVideo && (
            <div className="absolute bottom-2.5 left-2.5 flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#101211]/85 backdrop-blur-md border border-[#30372F] text-[10px] font-700 text-[#C6FF4D]">
              <Video size={11} className="text-[#C6FF4D]" />
              <span>VIDEO</span>
            </div>
          )}

          {/* Status Badge */}
          <div className="absolute top-2.5 left-2.5">
            {isActive ? (
              <span className="badge bg-[#101211]/85 backdrop-blur-md text-[#65D99A] border border-[#65D99A]/30">
                <span className="live-dot w-1.5 h-1.5 rounded-full bg-[#65D99A] inline-block" />
                Live
              </span>
            ) : status === 'scheduled' ? (
              <span className="badge bg-[#101211]/85 backdrop-blur-md text-[#82C9FF] border border-[#82C9FF]/30">
                Scheduled
              </span>
            ) : (
              <span className="badge bg-[#101211]/85 backdrop-blur-md text-[#A1A79E] border border-[#30372F]">
                {status}
              </span>
            )}
          </div>

          {/* Condition Badge */}
          {condition && (
            <div className="absolute top-2.5 right-2.5">
              <span className={`badge border ${conditionStyles[condition] || 'text-[#A1A79E] bg-[#101211]/80 border-[#30372F]'}`}>
                {condition}
              </span>
            </div>
          )}
        </div>

        {/* Card Body */}
        <div className="p-4 flex flex-col gap-2.5">
          {/* Category & Seller Row */}
          <div className="flex items-center justify-between text-xs text-[#A1A79E]">
            <span className="flex items-center gap-1 capitalize">
              <Tag size={11} className="text-[#747D72]" /> {category || 'General'}
            </span>
            <span className="text-[#747D72] truncate max-w-[120px]">
              @{seller?.username || 'seller'}
            </span>
          </div>

          {/* Product Title */}
          <h3 className="font-600 text-[#F4F5F0] text-sm leading-snug line-clamp-2 group-hover:text-[#C6FF4D] transition-colors duration-150">
            {title}
          </h3>

          {/* Price Section */}
          <div className="flex items-end justify-between pt-1">
            <div>
              <p className="text-[11px] text-[#747D72] font-500 mb-0.5">
                {hasBids ? 'Current bid' : 'Starting at'}
              </p>
              <p className="text-lg font-display font-700 text-[#C6FF4D] tabular-nums tracking-tight">
                ₹{Number(currentPrice || startingPrice || 0).toLocaleString('en-IN')}
              </p>
            </div>

            {hasBids ? (
              <span className="flex items-center gap-1 text-[11px] text-[#FFC857] font-500 bg-[#FFC857]/10 px-2 py-0.5 rounded border border-[#FFC857]/20">
                <TrendingUp size={11} /> Active
              </span>
            ) : (
              <span className="text-[11px] text-[#747D72] group-hover:text-[#F4F5F0] flex items-center gap-0.5 transition-colors">
                Bid <ArrowUpRight size={13} className="text-[#C6FF4D]" />
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Countdown Footer for Active Auctions */}
      {isActive && endsAt && (
        <div className="px-4 pb-3.5 pt-0">
          <div className="pt-2.5 border-t border-[#30372F]">
            <Countdown endsAt={endsAt} />
          </div>
        </div>
      )}
    </Link>
  );
}
