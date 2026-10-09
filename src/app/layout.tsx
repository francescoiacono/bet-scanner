import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bet Scanner | Odds Scanner",
  description:
    "Compare football bookmaker prices and identify theoretical arbitrage. Offline synthetic demo or separately approved live OddsRelay scans.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
