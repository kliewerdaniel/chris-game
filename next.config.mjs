/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The engine + world are pure TS and bundle to the client. The only server
  // piece is the /api/narrate serverless function. No native deps are bundled,
  // so no serverComponentsExternalPackages tweaks are needed.
};

export default nextConfig;
