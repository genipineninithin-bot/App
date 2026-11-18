import React from 'react';

const LANDMASS_PATHS = [
  'M 95,78 L 145,62 L 210,58 L 265,70 L 290,92 L 312,108 L 295,126 L 270,136 L 258,162 L 236,184 L 224,205 L 245,222 L 230,232 L 204,218 L 185,198 L 160,175 L 145,148 L 122,126 L 86,112 L 72,96 Z',
  'M 326,34 L 385,26 L 415,46 L 392,76 L 348,74 L 328,55 Z',
  'M 252,226 L 288,224 L 326,246 L 352,276 L 344,316 L 318,358 L 295,405 L 278,434 L 266,416 L 262,374 L 248,325 L 238,274 Z',
  'M 455,112 L 478,94 L 502,68 L 538,58 L 566,72 L 572,104 L 552,124 L 528,136 L 505,134 L 484,142 L 464,138 L 452,126 Z',
  'M 458,92 L 470,88 L 474,104 L 460,108 Z',
  'M 452,154 L 496,148 L 538,158 L 564,182 L 588,205 L 598,236 L 574,274 L 558,318 L 536,346 L 516,342 L 504,302 L 492,262 L 462,240 L 444,210 L 442,178 Z',
  'M 588,296 L 600,292 L 596,326 L 584,322 Z',
  'M 568,72 L 642,58 L 748,54 L 845,66 L 912,84 L 896,108 L 856,118 L 832,146 L 818,176 L 796,192 L 774,214 L 748,228 L 728,202 L 708,216 L 686,238 L 664,206 L 642,188 L 614,196 L 588,182 L 566,162 L 554,132 Z',
  'M 868,128 L 882,118 L 894,136 L 880,156 L 864,158 Z',
  'M 830,194 L 842,194 L 844,218 L 832,216 Z',
  'M 762,244 L 792,260 L 826,262 L 822,272 L 778,266 Z M 804,232 L 824,230 L 826,252 L 806,250 Z',
  'M 806,298 L 864,292 L 906,312 L 914,348 L 886,374 L 842,368 L 804,352 L 794,324 Z',
  'M 944,358 L 958,348 L 952,382 L 938,386 Z',
];

const CORRELATION_ARCS = [
  'M 184 148 Q 345 72 522 118',
  'M 522 118 Q 705 56 878 140',
  'M 878 140 Q 852 195 836 205',
  'M 522 118 Q 640 205 742 196',
  'M 294 316 Q 410 218 522 118',
];

const NODE_COORDS = [
  { x: 184, y: 148 },
  { x: 294, y: 316 },
  { x: 522, y: 118 },
  { x: 540, y: 192 },
  { x: 742, y: 196 },
  { x: 836, y: 205 },
  { x: 878, y: 140 },
  { x: 856, y: 336 },
];

export const NexoraBackground: React.FC = () => {
  return (
    <>
      {/* Deep Atmospheric Radial Illumination */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0"
        style={{
          background: [
            'radial-gradient(ellipse 68% 58% at 50% 38%, rgba(37, 99, 235, 0.22), transparent 72%)',
            'radial-gradient(circle at 18% 78%, rgba(14, 116, 144, 0.13), transparent 52%)',
            'radial-gradient(circle at 84% 24%, rgba(59, 130, 246, 0.12), transparent 48%)',
          ].join(', '),
        }}
      />

      {/* Precision Dot-Matrix Texture */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 bg-grid-matrix opacity-50"
      />

      {/* Full-Bleed Geospatial Vector & Telemetry Mesh */}
      <svg
        aria-hidden="true"
        viewBox="0 0 1000 500"
        preserveAspectRatio="xMidYMid slice"
        className="pointer-events-none fixed inset-0 h-full w-full"
      >
        <defs>
          <radialGradient id="radarSweepGrad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.13" />
            <stop offset="70%" stopColor="#3b82f6" stopOpacity="0.03" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="arcGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.08" />
            <stop offset="50%" stopColor="#3b82f6" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.2" />
          </linearGradient>
        </defs>

        <g stroke="#1e293b" strokeOpacity="0.52" strokeWidth="0.65">
          {[62.5, 125, 187.5, 250, 312.5, 375, 437.5].map((y) => (
            <line
              key={`lat-${y}`}
              x1="0"
              y1={y}
              x2="1000"
              y2={y}
              strokeDasharray={y === 250 ? '6 4' : '2 6'}
            />
          ))}
          {[100, 200, 300, 400, 500, 600, 700, 800, 900].map((x) => (
            <line
              key={`lon-${x}`}
              x1={x}
              y1="0"
              x2={x}
              y2="500"
              strokeDasharray={x === 500 ? '6 4' : '2 6'}
            />
          ))}
        </g>

        <g
          fill="#0f172a"
          fillOpacity="0.72"
          stroke="#1e3a5f"
          strokeOpacity="0.52"
          strokeWidth="0.9"
        >
          {LANDMASS_PATHS.map((d, idx) => (
            <path key={idx} d={d} />
          ))}
        </g>

        <g transform="translate(500, 210)" fill="none" className="animate-contour-breathe">
          <circle r="115" stroke="#3b82f6" strokeOpacity="0.18" strokeWidth="0.8" />
          <circle r="175" stroke="#3b82f6" strokeOpacity="0.11" strokeWidth="0.7" strokeDasharray="4 5" />
          <circle r="240" stroke="#1e40af" strokeOpacity="0.12" strokeWidth="0.7" />
        </g>

        <g transform="translate(500, 210)">
          <g className="animate-radar-sweep">
            <path
              d="M 0 0 L 0 -320 A 320 320 0 0 1 160 -277 Z"
              fill="url(#radarSweepGrad)"
            />
          </g>
        </g>

        <g fill="none" stroke="url(#arcGrad)" strokeWidth="1.15" strokeDasharray="5 4">
          {CORRELATION_ARCS.map((d, i) => (
            <path key={i} d={d} />
          ))}
        </g>

        <g>
          {NODE_COORDS.map((pt, idx) => (
            <g key={idx} transform={`translate(${pt.x}, ${pt.y})`}>
              <circle r="4.5" fill="none" stroke="#3b82f6" strokeOpacity="0.3" strokeWidth="0.8" />
              <circle r="1.5" fill="#60a5fa" fillOpacity="0.5" />
            </g>
          ))}
        </g>
      </svg>

      {/* Edge Vignette */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0"
        style={{
          background:
            'radial-gradient(circle at 50% 42%, transparent 36%, rgba(4, 6, 12, 0.85) 100%)',
        }}
      />
    </>
  );
};

export const NexoraLogoCenterpiece: React.FC = () => {
  return (
    <div className="pointer-events-none relative z-10 flex flex-col items-center text-center select-none px-4 py-4 sm:py-6 lg:py-2">
      <div className="flex flex-col items-center opacity-55 transition-opacity duration-300">
        <svg
          width="88"
          height="88"
          viewBox="0 0 96 96"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
          className="w-14 h-14 sm:w-16 sm:h-16 lg:w-[72px] lg:h-[72px] mb-2.5 sm:mb-3"
        >
          <defs>
            <linearGradient id="nexoraHexStroke" x1="12" y1="8" x2="84" y2="88" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#93c5fd" stopOpacity="0.9" />
              <stop offset="50%" stopColor="#3b82f6" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#1d4ed8" stopOpacity="0.9" />
            </linearGradient>
            <linearGradient id="nexoraNStroke" x1="28" y1="26" x2="68" y2="70" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#f8fafc" stopOpacity="0.92" />
              <stop offset="100%" stopColor="#93c5fd" stopOpacity="0.82" />
            </linearGradient>
          </defs>

          <path
            d="M48 6L84 26.8V69.2L48 90L12 69.2V26.8L48 6Z"
            fill="none"
            stroke="url(#nexoraHexStroke)"
            strokeWidth="2"
          />
          <circle
            cx="48"
            cy="48"
            r="28"
            fill="none"
            stroke="#3b82f6"
            strokeOpacity="0.32"
            strokeWidth="1"
            strokeDasharray="3 4"
          />
          <path
            d="M32 64V32L64 64V32"
            fill="none"
            stroke="url(#nexoraNStroke)"
            strokeWidth="5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="32" cy="32" r="3.2" fill="#60a5fa" fillOpacity="0.9" />
          <circle cx="64" cy="64" r="3.2" fill="#60a5fa" fillOpacity="0.9" />
          <circle cx="64" cy="32" r="2.5" fill="#f8fafc" fillOpacity="0.9" />
          <circle cx="32" cy="64" r="2.5" fill="#f8fafc" fillOpacity="0.9" />
        </svg>

        <h1 className="font-display text-2xl sm:text-4xl lg:text-[42px] font-bold tracking-tight text-slate-100/90 leading-none">
          Nexora <span className="font-medium text-blue-400/90">ai</span>
        </h1>
        <p className="mt-1.5 text-[10px] sm:text-[11px] font-mono tracking-[0.18em] uppercase text-blue-300/80">
          Predict. Protect. Respond. Empower.
        </p>
      </div>
    </div>
  );
};
