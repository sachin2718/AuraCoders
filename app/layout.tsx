import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "MeetMate",
  description: "AI-powered video meetings with live transcription, summaries, and action items.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="h-full bg-white">
      <body className="h-full bg-white text-[#2B050D] antialiased">{children}</body>
    </html>
  );
}
