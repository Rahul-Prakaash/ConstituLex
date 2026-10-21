export function Wheel() {
  const spokes = Array.from({ length: 24 }, (_, i) => i * 15);
  return (
    <div className="wheel" aria-hidden>
      <svg viewBox="-100 -100 200 200">
        <circle r="92" fill="none" stroke="currentColor" strokeWidth="5" />
        <circle r="80" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="2 4" opacity=".5" />
        <circle r="13" fill="currentColor" />
        {spokes.map((deg) => (
          <g key={deg} transform={`rotate(${deg})`}>
            <path d="M0 -12 L3.4 -50 L0 -88 L-3.4 -50 Z" fill="currentColor" opacity=".9" />
            <circle cy="-92" r="3.2" fill="var(--saffron)" transform="rotate(7.5)" />
          </g>
        ))}
      </svg>
    </div>
  );
}
