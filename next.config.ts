import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  redirects() {
    return [
      { source: "/odds", destination: "/", permanent: true },
      { source: "/backtest", destination: "/research#early-poisson", permanent: true },
      { source: "/diagnostics", destination: "/research#early-poisson", permanent: true },
      { source: "/models", destination: "/research#dixon-coles", permanent: true },
      { source: "/corners", destination: "/research#corners", permanent: true },
      { source: "/value", destination: "/research#historical-value", permanent: true },
      { source: "/calibration", destination: "/research#calibration", permanent: true },
    ];
  },
};

export default nextConfig;
