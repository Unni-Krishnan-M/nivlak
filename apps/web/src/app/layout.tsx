import type { Metadata } from "next";
import { Cormorant_Garamond, Literata } from "next/font/google";

import "../index.css";
import { FRAME_SET } from "@/components/book-camera";
import Providers from "@/components/providers";

// The book is set the way books are set: an old-style pair, not a UI face.
//
// Garalde serifs have held printed text for four centuries, and the reason to
// use two of them is that one face cannot do both jobs well here. Cormorant
// Garamond is a display cut -- high contrast, fine hairlines, gorgeous at
// 50px and unreadable at 12 -- so it takes the headlines and nothing else.
// Literata carries everything that has to be READ: it was drawn for Google
// Play Books, and its sturdier strokes are what keep light type from
// shimmering on a dark ground, which is exactly the failure mode a delicate
// Garamond has when you reverse it out.
const display = Cormorant_Garamond({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  style: ["normal", "italic"],
  display: "swap",
});

const text = Literata({
  variable: "--font-text",
  subsets: ["latin"],
  // Literata ships true italics and a real small-caps-friendly roman, which
  // the chapter opener's lead-in needs -- it was faking small caps on a face
  // that has none.
  style: ["normal", "italic"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "nivlak",
  description: "nivlak",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* The hero cannot paint until its first frame lands, and a frame
            requested from a client component is invisible to the preload
            scanner -- so it is hinted here instead. Two hints, because the
            frames come in two resolutions: the media queries have to agree
            exactly with pickTier() in book-camera.ts, or the browser warms one
            tier and the component then asks for the other. */}
        <link
          rel="preload"
          as="image"
          href={`/frames/${FRAME_SET}/sd/frame-001.webp`}
          type="image/webp"
          media="(max-width: 899px)"
          fetchPriority="high"
        />
        <link
          rel="preload"
          as="image"
          href={`/frames/${FRAME_SET}/hd/frame-001.webp`}
          type="image/webp"
          media="(min-width: 900px)"
          fetchPriority="high"
        />

        {/* Netlify injects its HUD badge script at the end of every HTML
            response served from *.netlify.app on the free plan -- it is not in
            this markup and there is no site setting to turn it off. The script
            reads its own per-site dismissal key before it renders anything, so
            pre-setting that key keeps the badge off; the observer is the
            belt-and-braces half, for the case where the tag lands before this
            runs or the key write throws (private mode, storage blocked). */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(()=>{try{for(const v of["public","owner-private"])localStorage.setItem("nl-hud:"+v+":v1","hidden")}catch(e){}
const kill=()=>{for(const el of document.querySelectorAll("script[data-nf-variant],#nl-hud-frame,#nl-badge-frame"))el.remove()};
kill();new MutationObserver(kill).observe(document.documentElement,{childList:true,subtree:true});
document.addEventListener("DOMContentLoaded",kill)})()`,
          }}
        />
      </head>
      <body className={`${display.variable} ${text.variable} font-[family-name:var(--font-text)] antialiased`}>
        {/* No chrome here on purpose: the landing page is the book reveal
            alone, full bleed. The routes that need navigation bring their own
            header in app/(chrome)/layout.tsx. */}
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
