/** @type {import('next').NextConfig} */
const nextConfig = {
  // Compile the shared workspace package from TypeScript source.
  transpilePackages: ["@ball-knowledge/shared"],
};

export default nextConfig;
