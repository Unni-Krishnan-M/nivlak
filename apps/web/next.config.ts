import "@nivlak/env/web";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: true,
  reactCompiler: true,
  async headers() {
    return [
      {
        // The hero frame sequence is ~1.7MB of immutable art; without this it
        // revalidates on every visit, since files in public/ are served with
        // max-age=0. It is genuinely immutable because the path is versioned:
        // a rebuilt sequence reuses the same filenames, so it goes in a new
        // /frames/<set>/ directory (FRAME_SET in book-camera.ts) rather than
        // over the top of one every returning visitor has cached for a year.
        source: "/frames/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
    ];
  },
};

export default nextConfig;

initOpenNextCloudflareForDev();
