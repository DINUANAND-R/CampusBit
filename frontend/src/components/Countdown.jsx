import useCountdown from '../hooks/useCountdown';
import { Clock, Zap } from 'lucide-react';

export default function Countdown({ endsAt, className = '' }) {
  const { total, hours, minutes, seconds, pad } = useCountdown(endsAt);

  if (total <= 0) {
    return (
      <span className={`badge text-rose-400 bg-rose-400/10 border border-rose-400/20 ${className}`}>
        Auction Ended
      </span>
    );
  }

  const isUrgent = total < 5 * 60 * 1000; // < 5 min
  const isLate   = total < 30 * 1000;      // < 30 s

  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      {isLate ? (
        <Zap size={14} className="text-gold-400 animate-bounce" />
      ) : (
        <Clock size={14} className={isUrgent ? 'text-rose-400' : 'text-brand-400'} />
      )}
      <span
        className={`font-mono font-700 text-sm ${
          isLate   ? 'shimmer-text' :
          isUrgent ? 'text-rose-400' : 'text-brand-400'
        }`}
      >
        {hours > 0 ? `${pad(hours)}h ` : ''}
        {pad(minutes)}m {pad(seconds)}s
      </span>
    </div>
  );
}
