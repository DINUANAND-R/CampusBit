import { useState, useEffect } from 'react';

const pad = (n) => String(n).padStart(2, '0');

const useCountdown = (endsAt) => {
  const calc = () => {
    const diff = new Date(endsAt) - Date.now();
    if (diff <= 0) return { total: 0, hours: 0, minutes: 0, seconds: 0 };
    return {
      total: diff,
      hours: Math.floor(diff / 3_600_000),
      minutes: Math.floor((diff % 3_600_000) / 60_000),
      seconds: Math.floor((diff % 60_000) / 1000),
    };
  };

  const [time, setTime] = useState(calc);

  useEffect(() => {
    const id = setInterval(() => setTime(calc()), 1000);
    return () => clearInterval(id);
  }, [endsAt]);

  return { ...time, pad };
};

export default useCountdown;
