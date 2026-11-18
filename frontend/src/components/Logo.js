export default function Logo({ size = 40, withWord = true, light = false }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <svg width={size} height={size} viewBox="0 0 512 512" aria-hidden="true">
        <rect width="512" height="512" rx="112" fill="#5B3DF5" />
        <path d="M136 168h240l-28 52h-80l-60 156h-62l60-156h-98z" fill="#fff" />
        <path d="M300 300h96l-22 40h-96z" fill="#FFB020" />
        <path d="M332 244h88l-20 36h-88z" fill="#FFB020" opacity=".7" />
      </svg>
      {withWord && (
        <span className={`text-xl font-extrabold tracking-tight ${light ? 'text-white' : 'text-ink'}`}>
          trans<span className="text-brand-500">ur</span>
        </span>
      )}
    </span>
  );
}
