import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import "./lobby.css";
import "./tdm.css";

export const metadata: Metadata = {
  title: "Erangel Strike | Warehouse TDM",
  description: "Two-team warehouse deathmatch with local and online rooms.",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="stylesheet" href="/fonts/fonts.css" />
      </head>
      <body>{children}</body>
    </html>
  );
}
