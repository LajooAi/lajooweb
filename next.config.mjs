import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep dev/build outputs isolated to avoid chunk mismatches when both run locally.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Pin tracing root to this app directory to avoid lockfile-root mis-detection.
  outputFileTracingRoot: __dirname,
  async redirects() {
    return [
      // Dev & prod safety net: redirect bare "/" to /my
      { source: '/', destination: '/my', permanent: false },
    ];
  },
};
export default nextConfig;
