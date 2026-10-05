/**
 * app/(auth)/login/page.tsx
 *
 * Supports BOTH instant one-click demo login AND email+password/magic-link.
 * Styled exclusively in White & Burgundy.
 */

"use client";

import { useState, useEffect, useTransition, Suspense, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createBrowserClient, DEMO_USERS, isSupabaseConfigured } from "@/lib/supabase";
import { Video, Loader2, Mail, Lock, Sparkles, Zap, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

type Mode = "quick" | "password" | "magic";
type PassTab = "signin" | "signup";

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#FFF0F3] flex items-center justify-center text-[#800020] font-bold">
          Loading...
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirectTo") ?? "/dashboard";
  const supabase = createBrowserClient();

  const [mode, setMode] = useState<Mode>("quick");
  const [passTab, setPassTab] = useState<PassTab>("signin");
  const [email, setEmail] = useState("priya@meetmate.ai");
  const [password, setPassword] = useState("password123");
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    document.title = "Sign In | MeetMate";
  }, []);

  async function handleQuickLogin(userKey: "priya" | "arjun" | "meera") {
    setMessage(null);
    startTransition(async () => {
      const user = DEMO_USERS[userKey];
      if (isSupabaseConfigured()) {
        const provision = await fetch("/api/auth/demo", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ userKey }),
        });
        const provisionResult = (await provision.json().catch(() => null)) as { error?: string } | null;
        if (!provision.ok) {
          setMessage({
            type: "err",
            text: provisionResult?.error ?? "Supabase could not prepare the demo profile.",
          });
          return;
        }
      }

      const { error } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: "demo-password",
      });
      if (error) {
        setMessage({ type: "err", text: error.message });
        return;
      }

      router.push(redirectTo);
      router.refresh();
    });
  }

  async function handleMagicLink(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    startTransition(async () => {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${location.origin}/auth/callback?next=${redirectTo}`,
        },
      });
      if (error) {
        setMessage({ type: "err", text: error.message });
      } else if (isSupabaseConfigured()) {
        setMessage({
          type: "ok",
          text: "Check your inbox for the sign-in link. This page will continue after you confirm it.",
        });
      } else {
        router.push(redirectTo);
        router.refresh();
      }
    });
  }

  async function handlePassword(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    startTransition(async () => {
      if (passTab === "signup") {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) {
          setMessage({ type: "err", text: error.message });
        } else if (isSupabaseConfigured() && !data.session) {
          setMessage({
            type: "ok",
            text: "Account created. Confirm the email sent by Supabase, then use Sign in.",
          });
        } else {
          router.push(redirectTo);
          router.refresh();
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          setMessage({ type: "err", text: error.message });
        } else {
          router.push(redirectTo);
          router.refresh();
        }
      }
    });
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#FFF0F3] px-4 py-8 text-[#2B050D]">
      <div className="relative w-full max-w-md">
        {/* Card */}
        <div className="overflow-hidden rounded-3xl border-2 border-[#800020] bg-white shadow-2xl shadow-[#800020]/15">
          {/* Header - Burgundy */}
          <div className="border-b-2 border-[#F0B8C4] bg-[#800020] px-8 py-6 text-white">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-[#800020] shadow-sm">
                <Video size={20} strokeWidth={2.4} />
              </span>
              <div>
                <h1 className="text-2xl font-extrabold tracking-tight">
                  Meet<span className="text-[#F7CBD4]">Mate</span>
                </h1>
                <p className="flex items-center gap-1.5 text-xs text-[#F7CBD4] font-medium">
                  <Sparkles size={12} />
                  AI-Powered Real-Time Meeting Workspace
                </p>
              </div>
            </div>
          </div>

          <div className="px-8 py-6">
            {/* Quick Demo Badge */}
            <div className="mb-5 flex items-center justify-between rounded-xl border border-[#F0B8C4] bg-[#FFF0F3] px-4 py-2 text-xs text-[#800020]">
              <span className="flex items-center gap-1.5 font-bold">
                <Zap size={14} className="text-[#800020]" />
                Demo Workspace
              </span>
              <span className="rounded-full bg-[#800020] px-2.5 py-0.5 text-[11px] font-bold text-white">
                1-Click Join
              </span>
            </div>

            {/* Mode selection tabs */}
            <div className="mb-6 flex gap-1.5 rounded-2xl border border-[#F0B8C4] bg-[#FFF0F3] p-1.5">
              {(
                [
                  { id: "quick", label: "⚡ Quick Demo" },
                  { id: "password", label: "🔑 Account" },
                  { id: "magic", label: "✨ Magic Link" },
                ] as const
              ).map((m) => (
                <button
                  key={m.id}
                  onClick={() => {
                    setMode(m.id);
                    setMessage(null);
                  }}
                  className={cn(
                    "flex-1 rounded-xl py-2 text-xs font-bold transition-all cursor-pointer",
                    mode === m.id
                      ? "bg-[#800020] text-white shadow-sm"
                      : "text-[#800020] hover:bg-white/50"
                  )}
                  id={`mode-${m.id}`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {/* ── 1. One-Click Demo Access ── */}
            {mode === "quick" && (
              <div className="space-y-4">
                <p className="text-xs font-semibold text-[#520919]">
                  Select a test profile to jump straight into the application:
                </p>

                {/* Primary: Priya Sharma */}
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => handleQuickLogin("priya")}
                  className="flex w-full items-center justify-between rounded-2xl border-2 border-[#800020] bg-[#FFF0F3] p-4 text-left transition-all hover:bg-[#FCE0E6] active:scale-[0.99] disabled:opacity-60 cursor-pointer shadow-sm group"
                  id="login-priya"
                >
                  <div className="flex items-center gap-3.5">
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#800020] text-sm font-bold text-white shadow-sm">
                      PS
                    </span>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-[#2B050D]">Priya Sharma</span>
                        <span className="rounded-full bg-[#800020] px-2 py-0.5 text-[10px] font-bold text-white">
                          Host
                        </span>
                      </div>
                      <p className="text-xs font-medium text-[#800020]/70">priya@meetmate.ai</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 text-xs font-bold text-[#800020] group-hover:translate-x-1 transition-transform">
                    <span>Enter</span>
                    <ArrowRight size={15} />
                  </div>
                </button>

                {/* Secondary profiles grid */}
                <div className="grid grid-cols-2 gap-3 pt-1">
                  {/* Arjun Mehta */}
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => handleQuickLogin("arjun")}
                    className="flex flex-col rounded-xl border border-[#F0B8C4] bg-white p-3 text-left transition-all hover:border-[#800020] hover:bg-[#FFF0F3] active:scale-[0.99] disabled:opacity-60 cursor-pointer shadow-sm"
                    id="login-arjun"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#800020] text-xs font-bold text-white">
                        AM
                      </span>
                      <span className="truncate text-xs font-bold text-[#2B050D]">Arjun Mehta</span>
                    </div>
                    <span className="text-[11px] font-medium text-[#800020]">Engineer</span>
                  </button>

                  {/* Meera Patel */}
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => handleQuickLogin("meera")}
                    className="flex flex-col rounded-xl border border-[#F0B8C4] bg-white p-3 text-left transition-all hover:border-[#800020] hover:bg-[#FFF0F3] active:scale-[0.99] disabled:opacity-60 cursor-pointer shadow-sm"
                    id="login-meera"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#800020] text-xs font-bold text-white">
                        MP
                      </span>
                      <span className="truncate text-xs font-bold text-[#2B050D]">Meera Patel</span>
                    </div>
                    <span className="text-[11px] font-medium text-[#800020]">Designer</span>
                  </button>
                </div>
              </div>
            )}

            {/* ── 2. Password form ── */}
            {mode === "password" && (
              <div className="space-y-4">
                <div className="flex gap-4 border-b border-[#F0B8C4] pb-1">
                  {(["signin", "signup"] as PassTab[]).map((t) => (
                    <button
                      key={t}
                      onClick={() => {
                        setPassTab(t);
                        setMessage(null);
                      }}
                      className={cn(
                        "text-xs font-bold pb-2 transition-colors cursor-pointer",
                        passTab === t
                          ? "border-b-2 border-[#800020] text-[#800020]"
                          : "text-[#800020]/50 hover:text-[#800020]"
                      )}
                      id={`tab-${t}`}
                    >
                      {t === "signin" ? "Sign in" : "Create account"}
                    </button>
                  ))}
                </div>

                <form onSubmit={handlePassword} className="space-y-3.5">
                  <Field
                    id="pw-email"
                    type="email"
                    label="Email Address"
                    icon={<Mail size={15} />}
                    value={email}
                    onChange={setEmail}
                    placeholder="demo@meetmate.ai"
                    required
                  />
                  <Field
                    id="pw-password"
                    type="password"
                    label="Password"
                    icon={<Lock size={15} />}
                    value={password}
                    onChange={setPassword}
                    placeholder="••••••••"
                    required
                    minLength={4}
                  />
                  <SubmitBtn
                    loading={isPending}
                    label={passTab === "signin" ? "Sign in to Dashboard" : "Create Account & Sign In"}
                  />
                </form>
              </div>
            )}

            {/* ── 3. Magic link form ── */}
            {mode === "magic" && (
              <form onSubmit={handleMagicLink} className="space-y-4">
                <p className="text-xs font-semibold text-[#520919]">
                  Enter your email address to sign in instantly:
                </p>
                <Field
                  id="magic-email"
                  type="email"
                  label="Email"
                  icon={<Mail size={15} />}
                  value={email}
                  onChange={setEmail}
                  placeholder="demo@meetmate.ai"
                  required
                />
                <SubmitBtn loading={isPending} label="Sign In with Email" />
              </form>
            )}

            {/* Feedback message */}
            {message && (
              <div
                className={cn(
                  "mt-4 rounded-xl border-2 px-4 py-3 text-xs font-bold",
                  message.type === "ok"
                    ? "border-[#800020] bg-[#FFF0F3] text-[#800020]"
                    : "border-[#9C0E2E] bg-[#FFF0F3] text-[#9C0E2E]"
                )}
                role="alert"
              >
                {message.text}
              </div>
            )}
          </div>
        </div>

        <p className="mt-5 text-center text-xs font-semibold text-[#800020]">
          MeetMate • Pure White &amp; Burgundy Edition
        </p>
      </div>
    </div>
  );
}

function Field({
  id,
  type,
  label,
  icon,
  value,
  onChange,
  placeholder,
  required,
  minLength,
}: {
  id: string;
  type: string;
  label: string;
  icon: React.ReactNode;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  minLength?: number;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-xs font-bold uppercase tracking-wider text-[#800020]">
        {label}
      </label>
      <div className="relative">
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#800020]">
          {icon}
        </span>
        <input
          id={id}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          required={required}
          minLength={minLength}
          className="w-full rounded-xl border-2 border-[#F0B8C4] bg-white py-2.5 pl-10 pr-3 text-sm font-semibold text-[#2B050D] placeholder-[#800020]/30 transition-colors focus:border-[#800020] focus:outline-none focus:ring-2 focus:ring-[#800020]/20"
        />
      </div>
    </div>
  );
}

function SubmitBtn({ loading, label }: { loading: boolean; label: string }) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#800020] px-4 py-3 text-sm font-bold text-white shadow-lg shadow-[#800020]/20 transition-all hover:bg-[#600018] focus:outline-none focus:ring-2 focus:ring-[#800020] disabled:opacity-60 cursor-pointer"
      id="submit-btn"
    >
      {loading && <Loader2 size={16} className="animate-spin" />}
      {label}
    </button>
  );
}
