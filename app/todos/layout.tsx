/**
 * app/todos/layout.tsx
 * Wraps user's personal to-dos page with the Navbar and responsive layout.
 */

import Navbar from "@/components/Navbar";
import MeetMateAssistant from "@/components/MeetMateAssistant";

export default function TodosLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <Navbar />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
        {children}
      </main>
      <MeetMateAssistant />
    </div>
  );
}
