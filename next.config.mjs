/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["unpdf"],
  outputFileTracingRoot: import.meta.dirname,
};

export default nextConfig;
