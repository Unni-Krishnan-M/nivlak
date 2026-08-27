"use client";

// Plates for the services, drawn rather than photographed.
//
// A catalogue page in a book sets a small cut beside each entry. There is no
// photograph of "SaaS product development" worth printing, and five stock
// images would fight the one real photograph this whole site is built on -- so
// these are line cuts in the same hand as the mark: hairlines, right angles,
// and a few filled nodes. They cost nothing to serve, stay sharp at any size,
// and take their colour from the type they sit beside.

export type EmblemName = "web" | "saas" | "ai" | "mobile" | "brand";

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 64 64"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="1"
      strokeLinecap="round"
      className="h-auto w-full"
    >
      {children}
    </svg>
  );
}

const EMBLEMS: Record<EmblemName, React.ReactNode> = {
  // A browser: chrome, a rule under it, and a trace running through the page.
  web: (
    <>
      <rect x="5" y="13" width="54" height="38" rx="2" opacity="0.45" />
      <path d="M5 23h54" opacity="0.45" />
      <circle cx="11" cy="18" r="1.5" fill="currentColor" opacity="0.6" />
      <circle cx="17" cy="18" r="1.5" fill="currentColor" opacity="0.35" />
      <circle cx="23" cy="18" r="1.5" fill="currentColor" opacity="0.35" />
      <path d="M13 37h13M38 37h13" opacity="0.4" />
      <circle cx="32" cy="37" r="3.4" fill="currentColor" opacity="0.85" />
      <path d="M13 45h20" opacity="0.25" />
    </>
  ),
  // Stacked planes: one service, many tenants.
  saas: (
    <>
      <path d="M32 9 57 20 32 31 7 20z" opacity="0.55" />
      <path d="M7 31 32 42 57 31" opacity="0.4" />
      <path d="M7 42 32 53 57 42" opacity="0.28" />
      <circle cx="32" cy="20" r="3.2" fill="currentColor" opacity="0.85" />
    </>
  ),
  // The circuit tree out of the mark, reduced to a graph.
  ai: (
    <>
      <path d="M32 54V20" opacity="0.5" />
      <path d="M32 34 19 27M32 34l13-7M32 44l-9-5M32 44l9-5" opacity="0.4" />
      <circle cx="32" cy="15" r="4" fill="currentColor" opacity="0.85" />
      <circle cx="17" cy="25" r="2.4" fill="currentColor" opacity="0.55" />
      <circle cx="47" cy="25" r="2.4" fill="currentColor" opacity="0.55" />
      <circle cx="21" cy="38" r="2.1" fill="currentColor" opacity="0.4" />
      <circle cx="43" cy="38" r="2.1" fill="currentColor" opacity="0.4" />
      <circle cx="32" cy="56" r="2.4" fill="currentColor" opacity="0.6" />
    </>
  ),
  // A handset.
  mobile: (
    <>
      <rect x="20" y="6" width="24" height="52" rx="3.5" opacity="0.5" />
      <path d="M28 12h8" opacity="0.5" />
      <path d="M26 28h5M33 28h5" opacity="0.35" />
      <circle cx="32" cy="34" r="3.2" fill="currentColor" opacity="0.85" />
      <path d="M26 41h12" opacity="0.28" />
      <circle cx="32" cy="52" r="1.8" fill="currentColor" opacity="0.45" />
    </>
  ),
  // A mark being struck: a device inside its keyline.
  brand: (
    <>
      <circle cx="32" cy="32" r="20" opacity="0.35" />
      <circle cx="32" cy="32" r="9" opacity="0.5" />
      <circle cx="32" cy="32" r="3.2" fill="currentColor" opacity="0.85" />
      <path d="M32 12v5M32 47v5M12 32h5M47 32h5" opacity="0.45" />
      <circle cx="46" cy="18" r="2" fill="currentColor" opacity="0.5" />
    </>
  ),
};

export function Emblem({
  name,
  className = "",
}: {
  name: EmblemName;
  className?: string;
}) {
  return (
    <div className={className}>
      <Frame>{EMBLEMS[name]}</Frame>
    </div>
  );
}
