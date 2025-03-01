/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'serverless',
  experimental: {
    serverActions: true,
  }
};

export default nextConfig;
