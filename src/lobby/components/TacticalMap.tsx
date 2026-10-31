export default function TacticalMap({ large = false }: { large?: boolean }) {
  return (
    <svg
      className={`tactical-map ${large ? "large" : ""}`}
      viewBox="0 0 300 220"
      aria-label="Warehouse team deathmatch map"
      role="img"
    >
      <defs>
        <pattern id="tdm-grid" width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M20 0H0v20" fill="none" stroke="#d5d0c2" strokeOpacity=".16" strokeWidth=".6" />
        </pattern>
        <linearGradient id="yard" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6d7270" />
          <stop offset="1" stopColor="#3e4446" />
        </linearGradient>
      </defs>
      <rect width="300" height="220" fill="#1b2428" />
      <rect x="28" y="24" width="244" height="172" fill="url(#yard)" />
      <rect x="28" y="24" width="244" height="172" fill="url(#tdm-grid)" />
      <rect x="34" y="78" width="42" height="64" fill="#24507a" opacity=".9" />
      <rect x="224" y="78" width="42" height="64" fill="#8a3a34" opacity=".9" />
      <rect x="108" y="72" width="84" height="76" fill="#8d928c" />
      <rect x="118" y="84" width="64" height="52" fill="#5d6366" />
      <rect x="146" y="78" width="8" height="64" fill="#cfc6ae" />
      <g fill="#2f5678">
        <rect x="52" y="36" width="28" height="12" />
        <rect x="86" y="40" width="12" height="26" />
        <rect x="168" y="150" width="30" height="12" />
      </g>
      <g fill="#6a4638">
        <rect x="214" y="38" width="28" height="12" />
        <rect x="196" y="154" width="26" height="12" />
        <rect x="70" y="156" width="30" height="12" />
      </g>
      <g fill="#5e6848">
        <rect x="132" y="34" width="34" height="12" />
        <rect x="128" y="168" width="36" height="12" />
      </g>
      <path d="M92 110h116M150 58v104" stroke="#e0b15a" strokeWidth="1.2" strokeDasharray="4 4" opacity=".7" />
      <circle cx="55" cy="110" r="4" fill="#7eb6ff" />
      <circle cx="245" cy="110" r="4" fill="#ff8d86" />
      {large && (
        <g fill="#f3efe4" fontSize="8" fontFamily="monospace" letterSpacing="1">
          <text x="38" y="74">BLUE SPAWN</text>
          <text x="214" y="74">RED SPAWN</text>
          <text x="118" y="68">WAREHOUSE</text>
          <text x="36" y="18" fill="#e8b259">WAREHOUSE TDM</text>
        </g>
      )}
    </svg>
  );
}
