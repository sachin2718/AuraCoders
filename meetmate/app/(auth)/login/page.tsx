/**
 * app/(auth)/login/page.tsx
 *
 * Supports BOTH magic-link AND email+password sign-in / sign-up.
 * Styled with White, Brown, and Burgundy theme (No Gradients).
 */

"use client";

import { useState, useEffect, useTransition, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase";
import { Video, Loader2, Mail, Lock, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

type Mode = "magic" | "password";
type PassTab = "signin" | "signup";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirectTo") ?? "/dashboard";
  const supabase = createBrowserClient();

  const [mode, setMode] = useState<Mode>("magic");
  const [passTab, setPassTab] = useState<PassTab>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    document.title = "Sign In | MeetMate";
  }, []);

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
        setMessage({
          type: "ok",
          text: "✉️ Magic link sent! Check your inbox and click the link to sign in.",
        });
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
          setMessage({
            type: "ok",
            text: "Account created! Check your email to confirm, then sign in.",
          });
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
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#1A110E] px-4">
      <div className="relative w-full max-w-md">
        {/* Solid Card - No Gradients */}
        <div className="overflow-hidden rounded-2xl border border-[#3E2922] bg-[#241815] shadow-xl">
          {/* Header - Solid Burgundy */}
          <div className="border-b border-[#522129] bg-[#722F37] px-8 py-7">
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

          <div className="px-8 py-7">
            {/* Mode tabs */}
            <div className="mb-6 flex gap-1 rounded-lg border border-[#3E2922] bg-[#1C120F] p-1">
              {(["magic", "password"] as Mode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => { setMode(m); setMessage(null); }}
                  className={cn(
                    "flex-1 rounded-md py-1.5 text-xs font-medium transition-all cursor-pointer",
                    mode === m
                      ? "bg-[#722F37] text-white shadow-sm"
                      : "text-[#B8A49C] hover:text-white"
                  )}
                  id={`mode-${m}`}
                >
                  {m === "magic" ? "✨ Magic Link" : "🔑 Email + Password"}
                </button>
              ))}
            </div>

            {/* ── Magic link form ── */}
            {mode === "magic" && (
              <form onSubmit={handleMagicLink} className="space-y-4">
                <p className="text-xs text-[#B8A49C]">
                  Enter your email — we&apos;ll send a one-click sign-in link. No password needed.
                </p>
                <Field
                  id="magic-email"
                  type="email"
                  label="Email"
                  icon={<Mail size={14} />}
                  value={email}
                  onChange={setEmail}
                  placeholder="you@example.com"
                  required
                />
                <SubmitBtn loading={isPending} label="Send magic link" />
              </form>
            )}

            {/* ── Password form ── */}
            {mode === "password" && (
              <div className="space-y-4">
                {/* Sub-tabs */}
                <div className="flex gap-4 border-b border-[#3E2922] pb-1">
                  {(["signin", "signup"] as PassTab[]).map((t) => (
                    <button
                      key={t}
                      onClick={() => { setPassTab(t); setMessage(null); }}
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
                <form onSubmit={handlePassword} className="space-y-4">
                  <Field
                    id="pw-email"
                    type="email"
                    label="Email"
                    icon={<Mail size={14} />}
                    value={email}
                    onChange={setEmail}
                    placeholder="you@example.com"
                    required
                  />
                  <Field
                    id="pw-password"
                    type="password"
                    label="Password"
                    icon={<Lock size={14} />}
                    value={password}
                    onChange={setPassword}
                    placeholder={passTab === "signup" ? "Min 6 characters" : "••••••••"}
                    required
                    minLength={6}
                  />
                  <SubmitBtn
                    loading={isPending}
                    label={passTab === "signin" ? "Sign in" : "Create account"}
                  />
                </form>
              </div>
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

        <p className="mt-6 text-center text-xs text-[#7A625A]">
          By signing in you agree to our Terms of Service.
        </p>
      </div>
    </div>
  );
}

/* ── Sub-components ──────────────────────────────────────────────────────── */

function Field({
  id, type, label, icon, value, onChange, placeholder, required, minLength,
}: {
  id: string; type: string; label: string; icon: React.ReactNode;
  value: string; onChange: (v: string) => void; placeholder?: string;
  required?: boolean; minLength?: number;
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
