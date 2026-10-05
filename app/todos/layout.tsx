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
    <>
      <Navbar />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">
        {children}
      </main>
    </>
  );
}
