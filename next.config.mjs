/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Keep heavy/optional native deps out of the server bundle; loaded at runtime.
  experimental: {
    serverComponentsExternalPackages: ["ollama", "node-fetch-native"],
  },
};

export default nextConfig;
