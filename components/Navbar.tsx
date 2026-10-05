/**
 * components/Navbar.tsx
 * Top navigation bar — styled exclusively in White & Burgundy.
 */

"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import { createBrowserClient } from "@/lib/supabase";
import { type User } from "@supabase/supabase-js";
import {
  Video,
  LayoutDashboard,
  CheckSquare,
  LogOut,
  ChevronDown,
  Menu,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/todos", label: "My To-Dos", icon: CheckSquare },
];

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createBrowserClient();

  const [user, setUser] = useState<User | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.auth
      .getUser()
      .then(({ data }: { data: { user: User | null } }) =>
        setUser(data?.user ?? null)
      );

    const { data: sub } = supabase.auth.onAuthStateChange(
      (_event: unknown, session: { user?: User | null } | null) => {
        setUser(session?.user ?? null);
      }
    );
    return () => sub?.subscription?.unsubscribe();
  }, [supabase]);

  // Close user dropdown on Escape or outside click
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setMenuOpen(false);
        setMobileOpen(false);
      }
    }
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    if (menuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [menuOpen]);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const initials = user?.email?.slice(0, 2).toUpperCase() ?? "MM";
  const displayName =
    user?.user_metadata?.display_name ?? user?.email?.split("@")[0] ?? "User";

  return (
    <header className="sticky top-0 z-50 w-full border-b border-[#F0B8C4] bg-white">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-2 px-4 sm:px-6">
        {/* Logo */}
        <Link
          href="/dashboard"
          className="flex shrink-0 items-center gap-2.5 rounded-xl p-1 font-semibold text-[#2B050D] transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#800020]"
          aria-label="MeetMate Home"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#800020] text-white shadow-md shadow-[#800020]/20">
            <Video size={18} strokeWidth={2.4} />
          </span>
          <span className="text-lg font-extrabold tracking-tight text-[#2B050D]">
            Meet<span className="text-[#800020]">Mate</span>
          </span>
        </Link>

        {/* Desktop nav links */}
        <nav className="hidden items-center gap-1 sm:flex">
          {NAV_LINKS.map(({ href, label, icon: Icon }) => {
            const isActive = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#800020]",
                  isActive
                    ? "bg-[#FFF0F3] text-[#800020] border border-[#F0B8C4] shadow-sm"
                    : "text-[#520919] hover:bg-[#FFF0F3] hover:text-[#800020]"
                )}
              >
                <Icon size={16} />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-3">
          {/* Desktop user menu */}
          {user ? (
            <div className="relative hidden sm:block" ref={menuRef}>
              <button
                onClick={() => setMenuOpen((o) => !o)}
                className="flex items-center gap-2 rounded-xl border border-[#F0B8C4] p-1.5 pr-2.5 text-sm font-semibold text-[#2B050D] transition-colors hover:bg-[#FFF0F3] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#800020] cursor-pointer"
                aria-expanded={menuOpen}
                aria-haspopup="true"
                id="user-menu-btn"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#800020] text-xs font-bold text-white shadow-sm">
                  {initials}
                </span>
                <span className="hidden max-w-[120px] truncate md:block">
                  {displayName}
                </span>
                <ChevronDown
                  size={14}
                  className={cn(
                    "transition-transform duration-200 text-[#800020]",
                    menuOpen && "rotate-180"
                  )}
                />
              </button>

              {menuOpen && (
                <div className="absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-2xl border-2 border-[#F0B8C4] bg-white shadow-xl shadow-[#800020]/10">
                  <div className="border-b border-[#F0B8C4] bg-[#FFF0F3] px-4 py-3">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-[#800020]">
                      Signed in as
                    </p>
                    <p className="mt-0.5 truncate text-sm font-semibold text-[#2B050D]">
                      {user.email}
                    </p>
                  </div>
                  <div className="p-2">
                    <button
                      onClick={signOut}
                      className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-semibold text-[#9C0E2E] transition-colors hover:bg-[#FFF0F3] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#800020] cursor-pointer"
                      id="sign-out-btn"
                    >
                      <LogOut size={16} />
                      Sign out
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <Link
              href="/login"
              className="hidden rounded-xl bg-[#800020] px-4 py-2 text-sm font-bold text-white shadow-sm transition-all hover:bg-[#600018] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#800020] sm:block"
            >
              Sign in
            </Link>
          )}

          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileOpen((o) => !o)}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#F0B8C4] text-[#800020] transition-colors hover:bg-[#FFF0F3] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#800020] sm:hidden cursor-pointer"
            aria-expanded={mobileOpen}
            aria-label="Open menu"
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Mobile menu drawer */}
      {mobileOpen && (
        <div className="border-t border-[#F0B8C4] bg-white px-4 pb-4 pt-2 sm:hidden">
          <nav className="flex flex-col gap-1.5">
            {NAV_LINKS.map(({ href, label, icon: Icon }) => {
              const isActive = pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition-all",
                    isActive
                      ? "bg-[#FFF0F3] text-[#800020] border border-[#F0B8C4]"
                      : "text-[#520919] hover:bg-[#FFF0F3] hover:text-[#800020]"
                  )}
                >
                  <Icon size={18} />
                  {label}
                </Link>
              );
            })}

            {user ? (
              <button
                onClick={signOut}
                className="mt-2 flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-[#9C0E2E] transition-colors hover:bg-[#FFF0F3]"
              >
                <LogOut size={18} />
                Sign out
              </button>
            ) : (
              <Link
                href="/login"
                className="mt-2 flex items-center justify-center rounded-xl bg-[#800020] py-2.5 text-sm font-bold text-white shadow-sm hover:bg-[#600018]"
              >
                Sign in
              </Link>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
