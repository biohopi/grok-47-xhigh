import { WEAPONS, type WeaponId } from "@/game/data";

export default function WeaponVisual({
  id,
  className = "",
}: {
  id: WeaponId;
  className?: string;
}) {
  const weapon = WEAPONS[id];
  if (weapon.image)
    return (
      <img
        className={`weapon-visual ${className}`}
        src={weapon.image}
        alt={`${weapon.name} side profile`}
        draggable={false}
      />
    );
  const sniper =
    weapon.category === "SNIPER RIFLE" || weapon.category === "DMR";
  const pistol = weapon.category === "SIDEARM";
  return (
    <svg
      className={`weapon-visual weapon-svg ${className}`}
      viewBox="0 0 420 150"
      fill="none"
      role="img"
      aria-label={`${weapon.name} silhouette`}
    >
      <defs>
        <linearGradient
          id={`metal-${id}`}
          x1="0"
          y1="40"
          x2="0"
          y2="110"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#85877b" />
          <stop offset=".4" stopColor="#4d5149" />
          <stop offset="1" stopColor="#252b27" />
        </linearGradient>
      </defs>
      <g fill={`url(#metal-${id})`} stroke="#a3a497" strokeWidth=".7">
        <path
          d={
            pistol
              ? "M145 45h125v27h-62l-17 52h-30l9-56h-25z"
              : "m28 66 68-9 31 6h118v26H128l-25-9-66 21-9-35Z"
          }
        />
        {!pistol && (
          <>
            <path d="m119 86 24 1-7 33-18-5 1-29ZM171 88h27l9 40-25 4-11-44Z" />
            <path d={`M241 67h${sniper ? 145 : 99}v8H241z`} />
            <path d="M109 60h132v5H109z" />
            <path d="M144 47h11v15h-11zM212 48h9v15h-9z" />
            {sniper ? (
              <>
                <rect x="139" y="35" width="96" height="16" rx="7" />
                <rect x="228" y="31" width="18" height="24" rx="4" />
                <rect x="135" y="32" width="12" height="22" rx="4" />
              </>
            ) : (
              <>
                <path d="M169 43h34v17h-34z" />
                <path d="M244 67h25v17h-25z" />
              </>
            )}
            {[150, 160, 170, 180, 190, 200, 210, 220, 230].map((x) => (
              <path
                key={x}
                d={`M${x} 67v10`}
                stroke="#202722"
                strokeWidth="3"
              />
            ))}
            <circle cx="134" cy="73" r="3" fill="#c3c3a9" />
            <path
              d="M102 67v13M61 64l4 26M78 61l4 24"
              stroke="#262d28"
              strokeWidth="3"
            />
          </>
        )}
      </g>
    </svg>
  );
}
