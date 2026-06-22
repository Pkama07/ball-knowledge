/** @type {import('next').NextConfig} */
const nextConfig = {
  // Compile the shared workspace package from TypeScript source.
  transpilePackages: ["@ball-knowledge/shared"],
  webpack: (config) => {
    // The shared package is ESM source: its relative imports carry `.js`
    // extensions (e.g. `import ... from "./domain.js"`) as Node ESM requires,
    // but the files on disk are `.ts`. Teach webpack to resolve a `.js`
    // specifier to the corresponding `.ts`/`.tsx` source so importing runtime
    // values (not just erased types) from the package resolves.
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".js": [".ts", ".tsx", ".js", ".jsx"],
    };
    return config;
  },
};

export default nextConfig;
