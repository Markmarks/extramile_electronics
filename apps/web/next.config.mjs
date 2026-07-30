/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // packages/* ship raw TS/TSX and are compiled by Next.
  transpilePackages: ['@extramile/core', '@extramile/ui'],
  images: {
    formats: ['image/avif', 'image/webp'],
  },
  // Linting runs as its own CI step against the repo-root flat config.
  eslint: { ignoreDuringBuilds: true },
  // Type errors must still fail the build.
  typescript: { ignoreBuildErrors: false },
};

export default nextConfig;
