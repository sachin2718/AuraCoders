/**
 * app/summary/layout.tsx
 * Wraps meeting summary pages with the Navbar and responsive container.
 */

import Navbar from "@/components/Navbar";

export default function SummaryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Navbar />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
        {children}
      </main>
    </>
  );
}
