export function Emblem({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      width="36"
      height="42"
      viewBox="0 0 36 42"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M18 2 33 10v18L18 40 3 28V10L18 2Z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="m18 9 9 6v10l-9 8-9-8V15l9-6Z"
        fill="currentColor"
        fillOpacity=".12"
      />
      <path
        d="m10 24 8-13 8 13h-5l-3-5-3 5h-5Zm5 4h6l-3 5-3-5Z"
        fill="currentColor"
      />
      <path d="M1 16h5M30 16h5M1 25h5M30 25h5" stroke="currentColor" />
    </svg>
  );
}

export default function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`brand ${compact ? "brand-compact" : ""}`}>
      <Emblem />
      <span>
        ERANGEL<span>STRIKE</span>
      </span>
    </span>
  );
}
