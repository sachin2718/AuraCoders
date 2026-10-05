/**
 * app/todos/layout.tsx
 * Wraps user's personal to-dos page with the Navbar and responsive layout.
 */

import Navbar from "@/components/Navbar";

export default function TodosLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-[#FAF8F5] dark:bg-[#18110E]">
      <Navbar />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
        {children}
      </main>
    </div>
  );
}
