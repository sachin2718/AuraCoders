/**
 * components/Navbar.tsx
 * Top navigation bar — responsive with hamburger menu on mobile.
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
  }, []);

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
    <header className="sticky top-0 z-50 w-full border-b border-[#E5DDD5] bg-white dark:border-[#382721] dark:bg-[#1C120F]">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-2 px-4 sm:px-6">
        {/* Logo */}
        <Link
          href="/dashboard"
          className="flex shrink-0 items-center gap-2 rounded-lg p-1 font-semibold text-[#2A1B18] transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#722F37] dark:text-[#F5EFEB]"
          aria-label="MeetMate Home"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#722F37] text-white shadow-sm">
            <Video size={16} strokeWidth={2.2} />
          </span>
          <span className="text-base font-bold tracking-tight">
            Meet<span className="text-[#722F37] dark:text-[#D97D8E]">Mate</span>
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
                  "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#722F37]",
                  isActive
                    ? "bg-[#FAF0F2] text-[#722F37] font-semibold dark:bg-[#361A21] dark:text-[#E8A2B0]"
                    : "text-[#6B534B] hover:bg-[#F2ECE6] hover:text-[#2A1B18] dark:text-[#C5B3AC] dark:hover:bg-[#281A16] dark:hover:text-white"
                )}
              >
                <Icon size={15} />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          {/* Desktop user menu */}
          {user ? (
            <div className="relative hidden sm:block" ref={menuRef}>
              <button
                onClick={() => setMenuOpen((o) => !o)}
                className="flex items-center gap-2 rounded-lg p-1.5 text-sm font-medium text-[#2A1B18] transition-colors hover:bg-[#F2ECE6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#722F37] dark:text-[#F5EFEB] dark:hover:bg-[#281A16] cursor-pointer"
                aria-expanded={menuOpen}
                aria-haspopup="true"
                id="user-menu-btn"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#EFE8E1] text-xs font-bold text-[#722F37] dark:bg-[#341B21] dark:text-[#E8A2B0]">
                  {initials}
                </span>
                <span className="hidden max-w-[120px] truncate md:block">
                  {displayName}
                </span>
                <ChevronDown
                  size={14}
                  className={cn(
                    "transition-transform duration-200 text-[#7A625A]",
                    menuOpen && "rotate-180"
                  )}
                />
              </button>

              {menuOpen && (
                <div className="absolute right-0 z-50 mt-1 w-56 overflow-hidden rounded-xl border border-[#E5DDD5] bg-white shadow-md dark:border-[#3E2D28] dark:bg-[#231815]">
                  <div className="border-b border-[#F0EAE3] px-4 py-3 dark:border-[#382721]">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-[#7A625A] dark:text-[#BCAAA4]">
                      Signed in as
                    </p>
                    <p className="mt-0.5 truncate text-sm font-medium text-[#2A1B18] dark:text-white">
                      {user.email}
                    </p>
                  </div>
                  <div className="p-1">
                    <button
                      onClick={signOut}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-[#8A2525] transition-colors hover:bg-[#FDF0F0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8A2525] dark:text-[#E69393] dark:hover:bg-[#381B1B] cursor-pointer"
                      id="sign-out-btn"
                    >
                      <LogOut size={14} />
                      Sign out
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <Link
              href="/login"
              className="hidden rounded-lg bg-[#722F37] px-3.5 py-1.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#5A1827] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#722F37] sm:block"
            >
              Sign in
            </Link>
          )}

          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileOpen((o) => !o)}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-[#2A1B18] transition-colors hover:bg-[#F2ECE6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#722F37] dark:text-[#F5EFEB] dark:hover:bg-[#281A16] sm:hidden cursor-pointer"
            aria-expanded={mobileOpen}
            aria-label="Open menu"
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Mobile menu drawer */}
      {mobileOpen && (
        <div className="border-t border-[#E5DDD5] bg-white px-4 pb-4 pt-2 dark:border-[#382721] dark:bg-[#1C120F] sm:hidden">
          <nav className="flex flex-col gap-1">
            {NAV_LINKS.map(({ href, label, icon: Icon }) => {
              const isActive = pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
                    isActive
                      ? "bg-[#FAF0F2] text-[#722F37] font-semibold dark:bg-[#361A21] dark:text-[#E8A2B0]"
                      : "text-[#6B534B] hover:bg-[#F2ECE6] hover:text-[#2A1B18] dark:text-[#C5B3AC] dark:hover:bg-[#281A16] dark:hover:text-white"
                  )}
                >
                  <Icon size={17} />
                  {label}
                </Link>
              );
            })}
          </nav>

          {user ? (
            <div className="mt-3 border-t border-[#F0EAE3] pt-3 dark:border-[#382721]">
              <div className="mb-2 flex items-center gap-3 px-3 py-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#EFE8E1] text-xs font-bold text-[#722F37] dark:bg-[#341B21] dark:text-[#E8A2B0]">
                  {initials}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[#2A1B18] dark:text-white">
                    {displayName}
                  </p>
                  <p className="truncate text-xs text-[#7A625A] dark:text-[#BCAAA4]">
                    {user.email}
                  </p>
                </div>
              </div>
              <button
                onClick={signOut}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-[#8A2525] transition-colors hover:bg-[#FDF0F0] dark:text-[#E69393] dark:hover:bg-[#381B1B] cursor-pointer"
              >
                <LogOut size={15} />
                Sign out
              </button>
            </div>
          ) : (
            <Link
              href="/login"
              className="mt-3 flex w-full items-center justify-center rounded-lg bg-[#722F37] px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-[#5A1827]"
            >
              Sign in
            </Link>
          )}
        </div>
      )}
    </header>
  );
}
