import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  client: {
    // OPTIONAL, defaulting to a same-origin path. Only /login and /dashboard
    // read it (tRPC and Better-Auth), and apps/server is not deployed with the
    // site -- so a required absolute URL failed every build that did not
    // happen to set it (Cloudflare's: "expected string, received undefined")
    // over a value the landing page never uses. A path is resolved against the
    // page's own origin by getServerUrl() in utils/trpc.ts and
    // lib/auth-client.ts, which already handled one; z.url() just never let it
    // through. Set an absolute URL here once the API server is deployed.
    NEXT_PUBLIC_SERVER_URL: z
      .union([z.url(), z.string().startsWith("/")])
      .default("/api"),
  },
  runtimeEnv: {
    NEXT_PUBLIC_SERVER_URL: process.env.NEXT_PUBLIC_SERVER_URL,
  },
  emptyStringAsUndefined: true,
});
