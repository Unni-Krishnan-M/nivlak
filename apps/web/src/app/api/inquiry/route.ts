import { NextResponse } from "next/server";
import { z } from "zod";

/**
 * The project inquiry's submission point.
 *
 * WHY IT IS HERE AND NOT IN THE tRPC ROUTER. There is a tRPC router in
 * `packages/api`, hosted by the Express app in `apps/server`, and it would be
 * the obvious home for this. It is the wrong one: Netlify builds
 * `pnpm --filter web build` and publishes `apps/web/.next` and nothing else,
 * so `apps/server` is not deployed and `NEXT_PUBLIC_SERVER_URL` does not
 * resolve to anything in production. A mutation added there would work in
 * `pnpm dev` and 404 on the live site, which is the worst of both -- an
 * inquiry form that looks like it works.
 *
 * A route handler ships with the site itself, through `@netlify/plugin-nextjs`.
 *
 * WHAT IT DOES AND DOES NOT DO. It validates, and then it forwards to whatever
 * `INQUIRY_WEBHOOK_URL` names -- a Formspree/Zapier/n8n endpoint, a mail
 * relay, anything that takes a JSON POST. That environment variable is the
 * integration point and it is the ONLY thing that needs configuring.
 *
 * When it is not set, this returns `delivered: false` rather than pretending.
 * Nothing here writes to the database: `packages/db` is not wired into the web
 * app's build, and adding Prisma to it to make a POST look successful would be
 * a fake backend by another name. The client reads `delivered` and shows one
 * of two confirmations accordingly -- see the note on <Confirmation> in
 * `book-inquiry.tsx`. An inquiry is never reported as sent unless something
 * downstream accepted it.
 *
 * Read straight off `process.env` and not through `@nivlak/env`, deliberately.
 * That package is imported for side effects so a missing variable fails the
 * BUILD rather than a request, which is right for a variable the site cannot
 * run without and wrong for one whose absence has a defined behaviour. Adding
 * it there would mean the site stops building until someone configures a
 * webhook.
 */

const Inquiry = z.object({
  building: z.string().min(1).max(120),
  problem: z.string().min(1).max(4000),
  stage: z.string().max(120),
  needs: z.array(z.string().max(120)).max(20),
  timeline: z.string().max(120),
  scale: z.string().max(120),
  name: z.string().min(1).max(200),
  company: z.string().max(200),
  // Loose on purpose, and the same shape the form checks at the keyboard: the
  // real validation of an address is whether the reply arrives.
  email: z.string().min(3).max(320).regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/),
  phone: z.string().max(60),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { delivered: false, error: "Malformed request." },
      { status: 400 },
    );
  }

  const parsed = Inquiry.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { delivered: false, error: "Some answers were missing or too long." },
      { status: 422 },
    );
  }

  const webhook = process.env.INQUIRY_WEBHOOK_URL;
  if (!webhook) {
    // Configured nowhere, so delivered nowhere. 200 rather than 500: the
    // request was understood and nothing went wrong -- there is simply no
    // destination, and the client has a working fallback for exactly this.
    return NextResponse.json({ delivered: false, reason: "not-configured" });
  }

  try {
    const response = await fetch(webhook, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        source: "nivlak.com / 07 — Connect",
        receivedAt: new Date().toISOString(),
        ...parsed.data,
      }),
    });
    if (!response.ok) {
      return NextResponse.json(
        { delivered: false, reason: "rejected" },
        { status: 502 },
      );
    }
    return NextResponse.json({ delivered: true });
  } catch {
    return NextResponse.json(
      { delivered: false, reason: "unreachable" },
      { status: 502 },
    );
  }
}
