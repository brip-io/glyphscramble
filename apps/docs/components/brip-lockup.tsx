interface BripLockupProps {
  className?: string;
  label?: string;
}

export function BripLockup({
  className = "",
  label = "brip",
}: BripLockupProps) {
  return (
    <span className={`brip-lockup ${className}`.trim()} aria-label={label}>
      <svg viewBox="0 0 40 38" aria-hidden="true">
        <path d="M 6 0 L 12.8 0 Q 15 0 16.17 1.87 L 18.83 6.13 Q 20 8 22.2 8 L 32 8 A 8 8 0 0 1 40 16 L 40 30 A 8 8 0 0 1 32 38 L 8 38 A 8 8 0 0 1 0 30 L 0 6 A 6 6 0 0 1 6 0 Z" />
      </svg>
      <span>
        brip<sup>™</sup>
      </span>
    </span>
  );
}
