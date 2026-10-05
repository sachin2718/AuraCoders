/**
 * app/summary/layout.tsx
 * Wraps meeting summary pages with the Navbar and responsive container.
 */

import Navbar from "@/components/Navbar";
import MeetMateAssistant from "@/components/MeetMateAssistant";

export default function SummaryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-[#FAF8F5] dark:bg-[#18110E]">
      <Navbar />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
        {children}
      </main>
      <MeetMateAssistant />
    </div>
  );
}
