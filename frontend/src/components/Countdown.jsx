import useCountdown from '../hooks/useCountdown';
import { Clock, Zap } from 'lucide-react';

export default function Countdown({ endsAt, className = '' }) {
  const { total, hours, minutes, seconds, pad } = useCountdown(endsAt);

  if (total <= 0) {
    return (
      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-600 text-[#FF7373] bg-[#FF7373]/10 border border-[#FF7373]/20 ${className}`}>
        Auction Ended
      </span>
    );
  }

  const isUrgent = total < 5 * 60 * 1000; // < 5 min
  const isLate = total < 30 * 1000;      // < 30 s

  return (
    <div className={`flex items-center gap-1.5 tabular-nums ${className}`}>
      {isLate ? (
        <Zap size={13} className="text-[#FFC857] animate-pulse" />
      ) : (
        <Clock size={13} className={isUrgent ? 'text-[#FFC857]' : 'text-[#C6FF4D]'} />
      )}
      <span
        className={`font-mono font-600 text-xs tracking-tight ${
          isLate
            ? 'text-[#FFC857] font-700'
            : isUrgent
            ? 'text-[#FFC857]'
            : 'text-[#C6FF4D]'
        }`}
      >
        {hours > 0 ? `${pad(hours)}h ` : ''}
        {pad(minutes)}m {pad(seconds)}s
      </span>
    </div>
  );
}
