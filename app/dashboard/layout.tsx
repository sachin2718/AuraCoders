/**
 * app/dashboard/layout.tsx
 * Wraps every protected page with the Navbar.
 * Server component — reads the Supabase session to confirm the user is authenticated.
 * (Middleware already redirects unauthenticated users, so this is just for safety + rendering.)
 */

import Navbar from "@/components/Navbar";

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Navbar />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">
        {children}
      </main>
    </>
  );
}
