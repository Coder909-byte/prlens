import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pure static site - no DB, no auth, nothing server-rendered. Vercel
  // serves this as static files, not a Node function.
  output: "export",
  reactStrictMode: true,
};

export default nextConfig;
