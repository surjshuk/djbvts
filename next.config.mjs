// next.config.mjs
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // 1) Put turbopack at TOP LEVEL (not inside experimental)
  turbopack: {
    root: __dirname, // pin this project as the workspace root
  },

  // 2) Keep pdfkit external to avoid the Helvetica.afm issue
  serverExternalPackages: ["pdfkit"],
};

export default nextConfig;
