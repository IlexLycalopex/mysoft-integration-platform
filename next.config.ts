import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ssh2 and ssh2-sftp-client use native Node.js crypto bindings that cannot
  // be bundled by Turbopack. Mark them as external so Next.js requires them
  // at runtime instead of trying to include them in ESM chunks.
  serverExternalPackages: ["ssh2", "ssh2-sftp-client"],
};

export default nextConfig;
