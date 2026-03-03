import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prevent lockfile conflict warning when running inside a parent workspace
  outputFileTracingRoot: path.join(__dirname),
  // Allow Chat SDK modules to run as server-side packages
  serverExternalPackages: ["chat", "@chat-adapter/slack", "@chat-adapter/state-memory", "@chat-adapter/state-redis"],
};

export default nextConfig;
