import type { NextConfig } from "next";
const nextConfig: NextConfig = { transpilePackages: ["@faith-adventures/auth", "@faith-adventures/database", "@faith-adventures/domain"] };
export default nextConfig;
