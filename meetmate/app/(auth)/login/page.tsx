/**
 * app/(auth)/login/page.tsx
 *
 * Supports BOTH instant one-click demo login AND email+password/magic-link.
 * Styled with White, Brown, and Burgundy theme (No Gradients).
 */

"use client";

import { useState, useEffect, useTransition, Suspense, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createBrowserClient, DEMO_USERS } from "@/lib/supabase";
import { Video, Loader2, Mail, Lock, Sparkles, UserCheck, Zap, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

type Mode = "quick" | "password" | "magic";
type PassTab = "signin" | "signup";

export default function LoginPage() {
  return (
    <Suspense
      fallback={
<<<<<<< HEAD
        <div className="min-h-screen bg-[#1A110E] flex items-center justify-center text-[#B89F96]">
          <Loader2 className="animate-spin mr-2" size={20} /> Loading...
=======
        <div className="min-h-screen bg-[#18110E] flex items-center justify-center text-[#A89F91]">
          Loading...
>>>>>>> 168fab069f7bffc318788b3dc5b7ddeedde02362
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
      await supabase.auth.signInWithPassword({
        email: user.email,
        password: "demo-password",
      });
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
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) {
          setMessage({ type: "err", text: error.message });
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
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#1A110E] px-4 py-8">
      <div className="relative w-full max-w-md">
        {/* Solid Card - No Gradients */}
        <div className="overflow-hidden rounded-2xl border border-[#3E2922] bg-[#241815] shadow-xl">
          {/* Header - Solid Burgundy */}
          <div className="border-b border-[#522129] bg-[#722F37] px-8 py-6">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-[#722F37] shadow-sm">
                <Video size={18} />
              </span>
              <div>
                <h1 className="text-xl font-bold text-white">
                  Meet<span className="text-[#E8A2B0]">Mate</span>
                </h1>
                <p className="flex items-center gap-1 text-xs text-[#F2C9D1]">
                  <Sparkles size={10} />
                  AI-powered meeting assistant
                </p>
              </div>
            </div>
          </div>

          <div className="px-8 py-6">
            {/* Quick Demo Badge */}
            <div className="mb-5 flex items-center justify-between rounded-lg border border-[#522129] bg-[#34161C] px-3.5 py-2 text-xs text-[#E8A2B0]">
              <span className="flex items-center gap-1.5 font-medium">
                <Zap size={13} className="text-[#F29EA8]" />
                Demo Mode Active
              </span>
              <span className="rounded bg-[#722F37] px-2 py-0.5 text-[11px] font-semibold text-white">
                1-Click Ready
              </span>
            </div>

            {/* Mode selection tabs */}
            <div className="mb-6 flex gap-1 rounded-lg border border-[#3E2922] bg-[#1C120F] p-1">
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
                    "flex-1 rounded-md py-1.5 text-xs font-medium transition-all cursor-pointer",
                    mode === m.id
                      ? "bg-[#722F37] text-white shadow-sm"
                      : "text-[#B8A49C] hover:text-white"
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
                <p className="text-xs text-[#B8A49C]">
                  Select a test profile to instantly jump straight into the application without entering credentials:
                </p>

                {/* Primary: Priya Sharma */}
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => handleQuickLogin("priya")}
                  className="flex w-full items-center justify-between rounded-xl border border-[#722F37] bg-[#3B1920] p-3.5 text-left transition-all hover:bg-[#4C1E29] hover:border-[#8E3B46] active:scale-[0.99] disabled:opacity-60 cursor-pointer shadow-sm group"
                  id="login-priya"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#722F37] text-sm font-bold text-white shadow-sm">
                      PS
                    </span>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-semibold text-white">Priya Sharma</span>
                        <span className="rounded bg-[#722F37]/80 px-1.5 py-0.5 text-[10px] font-medium text-[#F5C7D0]">
                          Host / Admin
                        </span>
                      </div>
                      <p className="text-xs text-[#B8A49C]">priya@meetmate.ai</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 text-xs font-medium text-[#E8A2B0] group-hover:text-white transition-colors">
                    <span>Enter</span>
                    <ArrowRight size={14} />
                  </div>
                </button>

                {/* Secondary profiles grid */}
                <div className="grid grid-cols-2 gap-2.5 pt-1">
                  {/* Arjun Mehta */}
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => handleQuickLogin("arjun")}
                    className="flex flex-col rounded-lg border border-[#3E2922] bg-[#1C120F] p-2.5 text-left transition-colors hover:border-[#722F37] hover:bg-[#281814] active:scale-[0.99] disabled:opacity-60 cursor-pointer"
                    id="login-arjun"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="flex h-6 w-6 items-center justify-center rounded bg-[#4E3128] text-[11px] font-bold text-[#EFE8E1]">
                        AM
                      </span>
                      <span className="truncate text-xs font-semibold text-white">Arjun Mehta</span>
                    </div>
                    <span className="text-[11px] text-[#8D766E]">Engineer</span>
                  </button>

                  {/* Meera Patel */}
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => handleQuickLogin("meera")}
                    className="flex flex-col rounded-lg border border-[#3E2922] bg-[#1C120F] p-2.5 text-left transition-colors hover:border-[#722F37] hover:bg-[#281814] active:scale-[0.99] disabled:opacity-60 cursor-pointer"
                    id="login-meera"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="flex h-6 w-6 items-center justify-center rounded bg-[#4E3128] text-[11px] font-bold text-[#EFE8E1]">
                        MP
                      </span>
                      <span className="truncate text-xs font-semibold text-white">Meera Patel</span>
                    </div>
                    <span className="text-[11px] text-[#8D766E]">Designer</span>
                  </button>
                </div>
              </div>
            )}

            {/* ── 2. Password form (Pre-filled for fast testing) ── */}
            {mode === "password" && (
              <div className="space-y-4">
                {/* Sub-tabs */}
                <div className="flex gap-4 border-b border-[#3E2922] pb-1">
                  {(["signin", "signup"] as PassTab[]).map((t) => (
                    <button
                      key={t}
                      onClick={() => {
                        setPassTab(t);
                        setMessage(null);
                      }}
                      className={cn(
                        "text-xs font-medium pb-1.5 transition-colors cursor-pointer",
                        passTab === t
                          ? "border-b-2 border-[#722F37] text-white"
                          : "text-[#8D766E] hover:text-[#B8A49C]"
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
                    icon={<Mail size={14} />}
                    value={email}
                    onChange={setEmail}
                    placeholder="demo@meetmate.ai"
                    required
                  />
                  <Field
                    id="pw-password"
                    type="password"
                    label="Password"
                    icon={<Lock size={14} />}
                    value={password}
                    onChange={setPassword}
                    placeholder="••••••••"
                    required
                    minLength={4}
                  />
                  <p className="text-[11px] text-[#8D766E]">
                    💡 Any email/password will work in demo mode.
                  </p>
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
                <p className="text-xs text-[#B8A49C]">
                  Enter your email address — in demo mode, clicking below signs in instantly:
                </p>
                <Field
                  id="magic-email"
                  type="email"
                  label="Email"
                  icon={<Mail size={14} />}
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
                  "mt-4 rounded-lg border px-4 py-3 text-sm",
                  message.type === "ok"
                    ? "border-[#722F37]/40 bg-[#FAF0F2]/10 text-[#F5C7D0]"
                    : "border-[#8A2525]/40 bg-[#FDF0F0]/10 text-[#F6B3B3]"
                )}
                role="alert"
              >
                {message.text}
              </div>
            )}
          </div>
        </div>

        <p className="mt-5 text-center text-xs text-[#7A625A]">
          MeetMate Demo Session • White, Brown & Burgundy Palette
        </p>
      </div>
    </div>
  );
}

/* ── Sub-components ──────────────────────────────────────────────────────── */

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
      <label htmlFor={id} className="block text-xs font-medium text-[#D4C3BC]">
        {label}
      </label>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8D766E]">
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
          className="w-full rounded-lg border border-[#443029] bg-[#1A110E] py-2.5 pl-9 pr-3 text-sm text-white placeholder-[#7A625A] transition-colors focus:border-[#722F37] focus:outline-none focus:ring-1 focus:ring-[#722F37]"
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
      className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#722F37] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#5A1827] focus:outline-none focus:ring-2 focus:ring-[#722F37] focus:ring-offset-2 focus:ring-offset-[#241815] disabled:opacity-60 cursor-pointer"
      id="submit-btn"
    >
      {loading && <Loader2 size={15} className="animate-spin" />}
      {label}
    </button>
  );
}
