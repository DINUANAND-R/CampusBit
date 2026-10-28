import React, { useState } from 'react';

/**
 * Responsive Date Filter Component
 */
export function DateRangeFilter({ selectedPeriod, onPeriodChange, customRange, onCustomChange }) {
  const [showCustom, setShowCustom] = useState(false);
  const [start, setStart] = useState(customRange?.startDate || '');
  const [end, setEnd] = useState(customRange?.endDate || '');

  const periods = [
    { id: '7d', label: 'Last 7 days' },
    { id: '30d', label: 'Last 30 days' },
    { id: '90d', label: 'Last 90 days' },
    { id: 'year', label: 'This year' },
    { id: 'all', label: 'All time' },
    { id: 'custom', label: 'Custom range' },
  ];

  const handleApplyCustom = (e) => {
    e.preventDefault();
    if (start && end) {
      onCustomChange({ startDate: start, endDate: end });
      onPeriodChange('custom');
      setShowCustom(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex rounded-xl bg-[#151815] p-1 border border-[#30372F]">
        {periods.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              if (id === 'custom') {
                setShowCustom(true);
              } else {
                onPeriodChange(id);
                setShowCustom(false);
              }
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-600 transition-all ${
              selectedPeriod === id
                ? 'bg-[#C6FF4D] text-[#101211] font-700 shadow-sm'
                : 'text-[#A1A79E] hover:text-[#F4F5F0] hover:bg-[#202620]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {showCustom && (
        <form onSubmit={handleApplyCustom} className="flex items-center gap-2 bg-[#1B201B] border border-[#C6FF4D]/30 p-2 rounded-xl text-xs animate-fade-in">
          <input
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="input py-1 px-2 text-xs"
            required
          />
          <span className="text-[#A1A79E]">to</span>
          <input
            type="date"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className="input py-1 px-2 text-xs"
            required
          />
          <button type="submit" className="btn btn-primary btn-sm py-1 px-2 text-xs font-700">
            Apply
          </button>
          <button
            type="button"
            onClick={() => setShowCustom(false)}
            className="btn btn-secondary btn-sm py-1 px-2 text-xs text-[#747D72]"
          >
            Cancel
          </button>
        </form>
      )}
    </div>
  );
}

/**
 * Responsive Interactive Area / Line Chart
 */
export function TrendAreaChart({
  data = [],
  dataKey = 'count',
  dataKey2 = null,
  label = 'Count',
  label2 = null,
  color = '#C6FF4D',
  color2 = '#65D99A',
  height = 240,
  emptyMessage = 'No activity recorded during this period.',
}) {
  const [hoverIndex, setHoverIndex] = useState(null);

  if (!data || data.length === 0 || data.every((d) => (d[dataKey] || 0) === 0 && (!dataKey2 || (d[dataKey2] || 0) === 0))) {
    return (
      <div
        style={{ height }}
        className="w-full flex flex-col items-center justify-center text-slate-500 text-xs rounded-xl bg-surface-800/40 border border-white/5 p-4 text-center"
      >
        <span className="text-2xl mb-2">📊</span>
        <p>{emptyMessage}</p>
      </div>
    );
  }

  const values1 = data.map((d) => Number(d[dataKey]) || 0);
  const values2 = dataKey2 ? data.map((d) => Number(d[dataKey2]) || 0) : [];
  const maxVal = Math.max(...values1, ...(values2.length ? values2 : [0]), 1);

  const paddingLeft = 40;
  const paddingRight = 20;
  const paddingTop = 20;
  const paddingBottom = 35;
  const chartWidth = 600;
  const chartHeight = height;

  const innerW = chartWidth - paddingLeft - paddingRight;
  const innerH = chartHeight - paddingTop - paddingBottom;

  const points1 = data.map((d, i) => {
    const x = paddingLeft + (i / Math.max(data.length - 1, 1)) * innerW;
    const y = paddingTop + innerH - ((Number(d[dataKey]) || 0) / maxVal) * innerH;
    return { x, y, item: d };
  });

  const pathD1 = points1.reduce(
    (acc, pt, i) => (i === 0 ? `M ${pt.x} ${pt.y}` : `${acc} L ${pt.x} ${pt.y}`),
    ''
  );

  const areaD1 = points1.length > 0
    ? `${pathD1} L ${points1[points1.length - 1].x} ${paddingTop + innerH} L ${points1[0].x} ${paddingTop + innerH} Z`
    : '';

  let pathD2 = '';
  let points2 = [];
  if (dataKey2) {
    points2 = data.map((d, i) => {
      const x = paddingLeft + (i / Math.max(data.length - 1, 1)) * innerW;
      const y = paddingTop + innerH - ((Number(d[dataKey2]) || 0) / maxVal) * innerH;
      return { x, y, item: d };
    });
    pathD2 = points2.reduce(
      (acc, pt, i) => (i === 0 ? `M ${pt.x} ${pt.y}` : `${acc} L ${pt.x} ${pt.y}`),
      ''
    );
  }

  // Y-axis ticks
  const yTicks = [0, Math.round(maxVal / 2), maxVal];

  // X-axis label step to avoid clutter
  const step = Math.max(1, Math.ceil(data.length / 6));

  return (
    <div className="relative w-full overflow-hidden select-none">
      <svg
        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
        className="w-full h-auto overflow-visible"
        style={{ minHeight: height }}
      >
        <defs>
          <linearGradient id={`gradient-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.35" />
            <stop offset="100%" stopColor={color} stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {/* Horizontal grid lines */}
        {yTicks.map((val, idx) => {
          const y = paddingTop + innerH - (val / maxVal) * innerH;
          return (
            <g key={idx}>
              <line
                x1={paddingLeft}
                y1={y}
                x2={chartWidth - paddingRight}
                y2={y}
                stroke="rgba(255,255,255,0.06)"
                strokeDasharray="4 4"
              />
              <text
                x={paddingLeft - 8}
                y={y + 3}
                fill="#64748b"
                fontSize="10"
                textAnchor="end"
              >
                {val}
              </text>
            </g>
          );
        })}

        {/* Area fill */}
        <path d={areaD1} fill={`url(#gradient-${dataKey})`} />

        {/* Primary Line */}
        <path
          d={pathD1}
          fill="none"
          stroke={color}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Secondary Line if provided */}
        {dataKey2 && (
          <path
            d={pathD2}
            fill="none"
            stroke={color2}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {/* X-axis labels */}
        {data.map((d, i) => {
          if (i % step !== 0 && i !== data.length - 1) return null;
          const x = paddingLeft + (i / Math.max(data.length - 1, 1)) * innerW;
          const labelText = d.date ? d.date.slice(5) : d.label || `#${i + 1}`;
          return (
            <text
              key={i}
              x={x}
              y={chartHeight - 10}
              fill="#94a3b8"
              fontSize="10"
              textAnchor="middle"
            >
              {labelText}
            </text>
          );
        })}

        {/* Interactive hover points & vertical cursor */}
        {points1.map((pt, i) => (
          <g
            key={i}
            onMouseEnter={() => setHoverIndex(i)}
            onMouseLeave={() => setHoverIndex(null)}
            className="cursor-pointer"
          >
            {/* Wider hit target */}
            <rect
              x={pt.x - innerW / data.length / 2}
              y={paddingTop}
              width={innerW / data.length}
              height={innerH}
              fill="transparent"
            />
            {hoverIndex === i && (
              <>
                <line
                  x1={pt.x}
                  y1={paddingTop}
                  x2={pt.x}
                  y2={paddingTop + innerH}
                  stroke="rgba(255,255,255,0.3)"
                  strokeDasharray="2 2"
                />
                <circle cx={pt.x} cy={pt.y} r="5" fill={color} stroke="#fff" strokeWidth="2" />
                {dataKey2 && points2[i] && (
                  <circle cx={points2[i].x} cy={points2[i].y} r="4" fill={color2} stroke="#fff" strokeWidth="1.5" />
                )}
              </>
            )}
          </g>
        ))}
      </svg>

      {/* Floating tooltip */}
      {hoverIndex !== null && data[hoverIndex] && (
        <div
          className="absolute z-20 pointer-events-none glass bg-surface-900/90 border border-white/10 px-3 py-2 rounded-xl text-xs shadow-xl backdrop-blur-md"
          style={{
            left: `${((points1[hoverIndex].x) / chartWidth) * 100}%`,
            top: '15px',
            transform: 'translateX(-50%)',
          }}
        >
          <p className="font-600 text-slate-300 mb-1">
            {data[hoverIndex].date || data[hoverIndex].label || `Item ${hoverIndex + 1}`}
          </p>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
            <span className="text-slate-400">{label}:</span>
            <span className="font-700 text-slate-100">{data[hoverIndex][dataKey] || 0}</span>
          </div>
          {dataKey2 && (
            <div className="flex items-center gap-2 mt-0.5">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color2 }} />
              <span className="text-slate-400">{label2}:</span>
              <span className="font-700 text-slate-100">{data[hoverIndex][dataKey2] || 0}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Responsive Bar Chart (Single or Grouped Comparison)
 */
export function ComparisonBarChart({
  data = [],
  key1 = 'startingPrice',
  key2 = 'finalPrice',
  label1 = 'Starting Price',
  label2 = 'Final Winning Bid',
  height = 240,
  emptyMessage = 'No completed auctions with winners available for comparison.',
}) {
  if (!data || data.length === 0) {
    return (
      <div
        style={{ height }}
        className="w-full flex flex-col items-center justify-center text-slate-500 text-xs rounded-xl bg-surface-800/40 border border-white/5 p-4 text-center"
      >
        <span className="text-2xl mb-2">🏷️</span>
        <p>{emptyMessage}</p>
      </div>
    );
  }

  const maxVal = Math.max(
    ...data.flatMap((d) => [Number(d[key1]) || 0, Number(d[key2]) || 0]),
    100
  );

  return (
    <div className="w-full flex flex-col gap-3 py-2" style={{ minHeight: height }}>
      {/* Legend */}
      <div className="flex items-center justify-end gap-4 text-xs">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-slate-500" />
          <span className="text-slate-400">{label1}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-emerald-400" />
          <span className="text-slate-400">{label2}</span>
        </div>
      </div>

      <div className="flex flex-col gap-2.5">
        {data.map((item, idx) => {
          const v1 = Number(item[key1]) || 0;
          const v2 = Number(item[key2]) || 0;
          const pct1 = (v1 / maxVal) * 100;
          const pct2 = (v2 / maxVal) * 100;
          const increase = v1 > 0 ? Math.round(((v2 - v1) / v1) * 100) : 0;

          return (
            <div key={idx} className="flex flex-col gap-1 p-2 rounded-xl bg-surface-800/40 border border-white/5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-600 text-slate-200 truncate max-w-[200px]" title={item.title}>
                  {item.title}
                </span>
                <span className="text-emerald-400 font-700">
                  +{increase}% (₹{v2.toLocaleString()})
                </span>
              </div>

              {/* Dual bar row */}
              <div className="flex flex-col gap-1 mt-0.5">
                {/* Starting price bar */}
                <div className="w-full bg-surface-700/50 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-slate-500 h-full rounded-full transition-all duration-500"
                    style={{ width: `${Math.max(pct1, 2)}%` }}
                    title={`Start: ₹${v1}`}
                  />
                </div>
                {/* Final price bar */}
                <div className="w-full bg-surface-700/50 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-emerald-500 to-brand-400 h-full rounded-full transition-all duration-500"
                    style={{ width: `${Math.max(pct2, 2)}%` }}
                    title={`Final: ₹${v2}`}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Donut / Segment Distribution Chart
 */
export function StatusDistributionChart({ distribution = {}, height = 220 }) {
  const statusColors = {
    active: { label: 'Active', color: '#10b981' },
    scheduled: { label: 'Scheduled', color: '#6366f1' },
    closed: { label: 'Closed', color: '#818cf8' },
    completed: { label: 'Completed', color: '#fbbf24' },
    unsold: { label: 'Unsold', color: '#94a3b8' },
    cancelled: { label: 'Cancelled', color: '#f43f5e' },
  };

  const entries = Object.entries(distribution)
    .filter(([_, count]) => count > 0)
    .map(([key, count]) => ({
      key,
      count,
      label: statusColors[key]?.label || key,
      color: statusColors[key]?.color || '#94a3b8',
    }));

  const total = entries.reduce((s, e) => s + e.count, 0);

  if (total === 0) {
    return (
      <div
        style={{ height }}
        className="w-full flex flex-col items-center justify-center text-slate-500 text-xs rounded-xl bg-surface-800/40 border border-white/5 p-4 text-center"
      >
        <span className="text-2xl mb-2">⭕</span>
        <p>No listings created yet to display status distribution.</p>
      </div>
    );
  }

  // Calculate SVG stroke dashes for circle donut
  let cumulative = 0;
  const circumference = 2 * Math.PI * 40; // r=40

  return (
    <div className="flex flex-col sm:flex-row items-center justify-center gap-6 p-2" style={{ minHeight: height }}>
      {/* SVG Donut */}
      <div className="relative w-36 h-36 shrink-0">
        <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
          <circle cx="50" cy="50" r="40" fill="transparent" stroke="rgba(255,255,255,0.06)" strokeWidth="12" />
          {entries.map((item, idx) => {
            const ratio = item.count / total;
            const strokeDasharray = `${ratio * circumference} ${circumference}`;
            const strokeDashoffset = -cumulative * circumference;
            cumulative += ratio;

            return (
              <circle
                key={idx}
                cx="50"
                cy="50"
                r="40"
                fill="transparent"
                stroke={item.color}
                strokeWidth="12"
                strokeDasharray={strokeDasharray}
                strokeDashoffset={strokeDashoffset}
                className="transition-all duration-500 hover:opacity-80"
              />
            );
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="font-display font-800 text-2xl text-slate-100">{total}</span>
          <span className="text-[10px] text-slate-400 uppercase tracking-widest">Total</span>
        </div>
      </div>

      {/* Legend list */}
      <div className="flex flex-col gap-2 flex-1 w-full max-w-xs">
        {entries.map((item, idx) => {
          const pct = Math.round((item.count / total) * 100);
          return (
            <div key={idx} className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="text-slate-300 font-500">{item.label}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-700 text-slate-100">{item.count}</span>
                <span className="text-[11px] text-slate-500 w-8 text-right">{pct}%</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
