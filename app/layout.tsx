import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CHRIS — a literary survival mystery",
  description:
    "An AI-native text adventure. A compiled knowledge graph becomes a living world under a deterministic game engine, with a local AI as the conversational interface.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
