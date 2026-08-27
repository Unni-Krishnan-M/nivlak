"use client";

import type { EmblemName } from "@/components/book-pages.content";

// Plates for the catalogue pages, drawn rather than photographed.
//
// A catalogue page in a book sets a small cut beside each entry. sample.jpeg
// uses icons for three of its seven sections and photographs for the rest, but
// stock photography would fight the one real photograph this whole site is
// built on -- the book itself -- and seventeen of them would fight each other.
// So every plate is a line cut in the same hand as the mark: hairlines, right
// angles, a few filled nodes. They cost nothing to serve, stay sharp at any
// size, and take their colour from the type they sit beside.

const EMBLEMS: Record<EmblemName, React.ReactNode> = {
  // --- 02 Solutions / 04 Work -------------------------------------------
  code: (
    <>
      <rect x="5" y="13" width="54" height="38" rx="2" opacity="0.4" />
      <path d="M5 22h54" opacity="0.4" />
      <circle cx="11" cy="17.5" r="1.4" fill="currentColor" opacity="0.55" />
      <circle cx="16.5" cy="17.5" r="1.4" fill="currentColor" opacity="0.3" />
      <path d="m25 30-7 7 7 7M39 30l7 7-7 7" opacity="0.75" />
      <path d="m35 28-6 18" opacity="0.4" />
    </>
  ),
  cloud: (
    <>
      <path
        d="M19 44a10 10 0 0 1 .6-20 14 14 0 0 1 26.2 4A9 9 0 0 1 45 44z"
        opacity="0.5"
      />
      <path d="M26 34h8M38 34h4" opacity="0.4" />
      <circle cx="36" cy="34" r="2.6" fill="currentColor" opacity="0.8" />
      <path d="M32 48v7M22 48v4M42 48v4" opacity="0.35" />
    </>
  ),
  chip: (
    <>
      <rect x="18" y="18" width="28" height="28" rx="2" opacity="0.5" />
      <rect x="27" y="27" width="10" height="10" rx="1" opacity="0.6" />
      <path
        d="M24 18v-7M32 18v-7M40 18v-7M24 46v7M32 46v7M40 46v7M18 24h-7M18 32h-7M18 40h-7M46 24h7M46 32h7M46 40h7"
        opacity="0.35"
      />
      <circle cx="32" cy="32" r="2.4" fill="currentColor" opacity="0.85" />
    </>
  ),
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
  megaphone: (
    <>
      <path d="M14 26v12l26 10V16z" opacity="0.5" />
      <path d="M14 27H9a3 3 0 0 0-3 3v4a3 3 0 0 0 3 3h5" opacity="0.45" />
      <path d="M20 40v9a3 3 0 0 0 6 0v-6" opacity="0.4" />
      <path d="M46 26h6M46 32h9M46 38h6" opacity="0.4" />
      <circle cx="57" cy="32" r="2.2" fill="currentColor" opacity="0.75" />
    </>
  ),
  book: (
    <>
      <path d="M32 18v34" opacity="0.5" />
      <path d="M32 18c-6-4-13-5-22-5v34c9 0 16 1 22 5" opacity="0.45" />
      <path d="M32 18c6-4 13-5 22-5v34c-9 0-16 1-22 5" opacity="0.45" />
      <path d="M16 24h9M16 31h9M39 24h9M39 31h9" opacity="0.28" />
      <circle cx="32" cy="52" r="2.2" fill="currentColor" opacity="0.7" />
    </>
  ),

  // --- 03 Approach --------------------------------------------------------
  search: (
    <>
      <circle cx="28" cy="28" r="15" opacity="0.5" />
      <path d="m39 39 13 13" opacity="0.55" />
      <path d="M21 28h5M31 28h4" opacity="0.35" />
      <circle cx="28.5" cy="28" r="2.4" fill="currentColor" opacity="0.8" />
    </>
  ),
  target: (
    <>
      <circle cx="32" cy="32" r="20" opacity="0.35" />
      <circle cx="32" cy="32" r="11" opacity="0.5" />
      <circle cx="32" cy="32" r="2.8" fill="currentColor" opacity="0.85" />
      <path d="M32 12v6M32 46v6M12 32h6M46 32h6" opacity="0.4" />
    </>
  ),
  pencil: (
    <>
      <path d="M14 50 12 40l26-26 8 8-26 26z" opacity="0.5" />
      <path d="m38 14 5-5a4 4 0 0 1 6 0l2 2a4 4 0 0 1 0 6l-5 5" opacity="0.45" />
      <path d="m12 40 8 8" opacity="0.35" />
      <path d="M28 46h24" opacity="0.3" />
      <circle cx="46" cy="46" r="2.2" fill="currentColor" opacity="0.7" />
    </>
  ),
  rocket: (
    <>
      <path
        d="M32 8c8 7 12 16 12 26l-6 8H26l-6-8c0-10 4-19 12-26z"
        opacity="0.5"
      />
      <circle cx="32" cy="27" r="4.4" opacity="0.6" />
      <path d="M26 42c-3 5-3 9-2 13 4-2 6-5 7-9M38 42c3 5 3 9 2 13-4-2-6-5-7-9" opacity="0.4" />
      <circle cx="32" cy="55" r="2.2" fill="currentColor" opacity="0.8" />
    </>
  ),
  chart: (
    <>
      <path d="M10 52h44" opacity="0.45" />
      <path d="M10 52V14" opacity="0.45" />
      <path d="m16 42 11-11 9 8 15-19" opacity="0.6" />
      <path d="M44 20h7v7" opacity="0.45" />
      <circle cx="27" cy="31" r="2.2" fill="currentColor" opacity="0.75" />
      <circle cx="36" cy="39" r="2.2" fill="currentColor" opacity="0.5" />
    </>
  ),

  // --- 05 Perspectives ----------------------------------------------------
  compass: (
    <>
      <circle cx="32" cy="32" r="21" opacity="0.45" />
      <path d="m40 24-5 13-13 5 5-13z" opacity="0.55" />
      <circle cx="32" cy="32" r="2.2" fill="currentColor" opacity="0.85" />
      <path d="M32 8v4M32 52v4M8 32h4M52 32h4" opacity="0.35" />
    </>
  ),
  telescope: (
    <>
      <path d="m10 34 30-16 6 11-30 16z" opacity="0.5" />
      <path d="m43 21 8-4 4 8-8 4" opacity="0.45" />
      <path d="M24 40v10M24 50l-7 6M24 50l7 6" opacity="0.4" />
      <circle cx="48" cy="24" r="2.4" fill="currentColor" opacity="0.8" />
    </>
  ),

  // --- 07 Connect ---------------------------------------------------------
  phone: (
    <>
      <path
        d="M18 10h9l5 12-6 4a24 24 0 0 0 12 12l4-6 12 5v9a4 4 0 0 1-4 4C29 50 14 35 14 14a4 4 0 0 1 4-4z"
        opacity="0.5"
      />
      <circle cx="46" cy="18" r="2.2" fill="currentColor" opacity="0.7" />
    </>
  ),
  mail: (
    <>
      <rect x="8" y="16" width="48" height="32" rx="2" opacity="0.5" />
      <path d="m8 20 24 16 24-16" opacity="0.5" />
      <circle cx="32" cy="36" r="2.4" fill="currentColor" opacity="0.75" />
    </>
  ),
  globe: (
    <>
      <circle cx="32" cy="32" r="21" opacity="0.45" />
      <path d="M11 32h42" opacity="0.4" />
      <path d="M32 11c7 7 7 35 0 42-7-7-7-35 0-42z" opacity="0.4" />
      <circle cx="32" cy="32" r="2.2" fill="currentColor" opacity="0.8" />
    </>
  ),
  pin: (
    <>
      <path d="M32 8a15 15 0 0 1 15 15c0 11-15 33-15 33S17 34 17 23A15 15 0 0 1 32 8z" opacity="0.5" />
      <circle cx="32" cy="23" r="5.5" opacity="0.6" />
      <circle cx="32" cy="23" r="1.8" fill="currentColor" opacity="0.85" />
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
      <svg
        viewBox="0 0 64 64"
        aria-hidden="true"
        focusable="false"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-auto w-full"
      >
        {EMBLEMS[name]}
      </svg>
    </div>
  );
}
