export function Logo({ className = "" }: { className?: string }) {
  // Abstract mark: stacked rows flowing into a structured grid cell — "messy
  // text becomes an ordered spreadsheet". Monochrome, uses currentColor.
  return (
    <svg
      className={className}
      viewBox="0 0 32 32"
      fill="none"
      role="img"
      aria-label="PO Importer logo"
      width="32"
      height="32"
    >
      <rect x="2" y="3" width="28" height="26" rx="5" className="text-primary" stroke="currentColor" strokeWidth="2" />
      <line x1="2" y1="11" x2="30" y2="11" stroke="currentColor" strokeWidth="2" />
      <line x1="16" y1="11" x2="16" y2="29" stroke="currentColor" strokeWidth="2" />
      <path d="M6 17h6M6 21h6M6 25h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M20 21l2.5 2.5L27 18.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
