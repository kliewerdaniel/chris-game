import type { Metadata } from "next";
import { Newsreader, Fraunces, IBM_Plex_Mono } from "next/font/google";
import "./tokens.css";
import "./globals.css";

const newsreader = Newsreader({
  subsets: ["latin"],
  variable: "--font-newsreader",
  display: "swap",
  style: ["normal", "italic"],
});
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
});
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-plex",
  display: "swap",
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "CHRIS — a literary survival mystery",
  description:
    "An AI-native text adventure. A compiled knowledge graph becomes a living world under a deterministic game engine, with a local AI as the conversational interface.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${newsreader.variable} ${fraunces.variable} ${plexMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
