"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useEffect, useRef, useState } from "react";

gsap.registerPlugin(ScrollTrigger, useGSAP);

const FRAME_COUNT = 40;
const FRAME_SRC = (index: number) =>
  `/frames/frame-${String(index).padStart(3, "0")}.webp`;

export function BookScrollReveal() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const kickerRef = useRef<HTMLParagraphElement>(null);
  const headlineRef = useRef<HTMLHeadingElement>(null);
  const taglineRef = useRef<HTMLParagraphElement>(null);
  const scrollCueRef = useRef<HTMLDivElement>(null);
  const imagesRef = useRef<HTMLImageElement[]>([]);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let loaded = 0;
    const images: HTMLImageElement[] = [];

    for (let i = 1; i <= FRAME_COUNT; i++) {
      const img = new window.Image();
      img.src = FRAME_SRC(i);
      img.onload = img.onerror = () => {
        loaded += 1;
        if (loaded === FRAME_COUNT && !cancelled) setIsReady(true);
      };
      images.push(img);
    }
    imagesRef.current = images;

    return () => {
      cancelled = true;
    };
  }, []);

  useGSAP(
    () => {
      if (!isReady) return;
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;

      const draw = (frameIndex: number) => {
        const img = imagesRef.current[frameIndex];
        if (!img || !img.complete || img.naturalWidth === 0) return;

        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const width = canvas.clientWidth;
        const height = canvas.clientHeight;
        const pixelWidth = Math.round(width * dpr);
        const pixelHeight = Math.round(height * dpr);
        if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
          canvas.width = pixelWidth;
          canvas.height = pixelHeight;
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        const imageRatio = img.naturalWidth / img.naturalHeight;
        const boxRatio = width / height;
        let drawWidth = width;
        let drawHeight = height;
        let offsetX = 0;
        let offsetY = 0;
        if (imageRatio > boxRatio) {
          drawHeight = height;
          drawWidth = height * imageRatio;
          offsetX = (width - drawWidth) / 2;
        } else {
          drawWidth = width;
          drawHeight = width / imageRatio;
          offsetY = (height - drawHeight) / 2;
        }

        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
      };

      const playhead = { frame: 0 };
      draw(0);

      const onResize = () => draw(Math.round(playhead.frame));
      window.addEventListener("resize", onResize);

      const mm = gsap.matchMedia();

      mm.add(
        {
          reduced: "(prefers-reduced-motion: reduce)",
          full: "(prefers-reduced-motion: no-preference)",
        },
        (context) => {
          const { reduced } = context.conditions as { reduced: boolean };

          if (reduced) {
            draw(FRAME_COUNT - 1);
            gsap.set(
              [
                kickerRef.current,
                headlineRef.current,
                taglineRef.current,
              ].filter(Boolean),
              { autoAlpha: 1, y: 0 },
            );
            gsap.set(scrollCueRef.current, { autoAlpha: 0 });
            return;
          }

          const tl = gsap.timeline({
            defaults: { ease: "none" },
            scrollTrigger: {
              trigger: sectionRef.current,
              start: "top top",
              end: "+=300%",
              scrub: 0.6,
              pin: true,
              anticipatePin: 1,
            },
            onUpdate: () => draw(Math.round(playhead.frame)),
          });

          tl.to(playhead, { frame: FRAME_COUNT - 1, duration: 1 }, 0);

          // Title is visible on load; fade it out early, before the book
          // visibly starts opening (~progress 0.5), so the reveal gets a
          // clean, text-free stage.
          if (kickerRef.current && headlineRef.current) {
            tl.to(
              [kickerRef.current, headlineRef.current],
              { autoAlpha: 0, y: -16, duration: 0.12 },
              0.06,
            );
          }

          if (taglineRef.current) {
            tl.fromTo(
              taglineRef.current,
              { autoAlpha: 0, y: 16 },
              { autoAlpha: 1, y: 0, duration: 0.1 },
              0.16,
            ).to(taglineRef.current, { autoAlpha: 0, y: -16, duration: 0.1 }, 0.34);
          }

          if (scrollCueRef.current) {
            tl.to(scrollCueRef.current, { autoAlpha: 0, duration: 0.06 }, 0.02);
          }

          return () => {
            tl.scrollTrigger?.kill();
            tl.kill();
          };
        },
      );

      return () => {
        window.removeEventListener("resize", onResize);
        mm.revert();
      };
    },
    { dependencies: [isReady], scope: sectionRef },
  );

  return (
    <section
      ref={sectionRef}
      className="relative h-screen w-full overflow-hidden bg-[#050a14]"
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/50" />

      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
        <p
          ref={kickerRef}
          className="mb-3 text-xs tracking-[0.3em] text-slate-300/80 uppercase"
        >
          Nivlak Technologies
        </p>
        <h1
          ref={headlineRef}
          className="max-w-2xl text-3xl font-semibold text-white sm:text-5xl"
        >
          Every page, engineered.
        </h1>
        <p
          ref={taglineRef}
          className="mt-4 max-w-md text-sm text-slate-300/80 sm:text-base invisible"
        >
          Scroll to open the story.
        </p>
      </div>

      <div
        ref={scrollCueRef}
        className="pointer-events-none absolute bottom-8 left-1/2 flex -translate-x-1/2 flex-col items-center gap-2 text-slate-300/70"
      >
        <span className="text-[10px] tracking-[0.25em] uppercase">Scroll</span>
        <span className="h-8 w-px animate-pulse bg-slate-300/50" />
      </div>
    </section>
  );
}
