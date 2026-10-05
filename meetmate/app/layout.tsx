import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "MeetMate — AI Meeting Assistant",
    template: "%s | MeetMate",
  },
  description:
    "AI-powered meeting assistant: instant transcripts, consensus decisions, and personalized action items for every participant.",
  icons: {
    icon: "/icon.svg",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[#FAF8F5] text-[#2A1B18] selection:bg-[#FAF0F2] selection:text-[#722F37] dark:bg-[#18110E] dark:text-[#F5EFEB] dark:selection:bg-[#361A21] dark:selection:text-[#E8A2B0]">
        {children}
      </body>
    </html>
  );
}
