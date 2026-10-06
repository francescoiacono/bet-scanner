import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bet Scanner | Simulation",
  description:
    "A local football betting-market research dashboard using entirely fictional mock data.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
