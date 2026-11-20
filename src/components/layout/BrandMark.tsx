// Product mark: a ring in Rasner's cyan and green around a route line, then the product name.
export function BrandMark({ tagline, className }: { tagline?: string; className?: string }) {
  return (
    <div className={`flex items-center gap-2.5 ${className ?? ''}`} dir="ltr">
      <svg viewBox="0 0 32 32" className="size-8 shrink-0" aria-hidden>
        <circle cx="16" cy="16" r="13" fill="none" stroke="var(--brand-cyan)" strokeWidth="3" strokeDasharray="56 26" strokeLinecap="round" transform="rotate(-40 16 16)" />
        <circle cx="16" cy="16" r="13" fill="none" stroke="var(--brand-green)" strokeWidth="3" strokeDasharray="18 64" strokeDashoffset="-60" strokeLinecap="round" transform="rotate(-40 16 16)" />
        <path d="M10 20.5 L14 13 L18 18 L22.5 11" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div className="leading-tight">
        <div className="text-[15px] font-bold tracking-wide">ROADNET</div>
        {tagline && <div className="text-[11px] font-medium opacity-70" dir="auto">{tagline}</div>}
      </div>
    </div>
  );
}
