/**
 * app/(auth)/login/page.tsx
 *
 * Professional Enterprise Authentication for MeetMate.
 * Styled exclusively in White & Burgundy.
 * Standard Email/Password & Passwordless Magic Link authentication.
 */

"use client";

import { useState, useEffect, useTransition, Suspense, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createBrowserClient, isSupabaseConfigured } from "@/lib/supabase";
import {
  Video,
  Loader2,
  Mail,
  Lock,
  Eye,
  EyeOff,
  User,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  ArrowRight,
  KeyRound,
  Layers,
  Radio,
} from "lucide-react";
import { cn } from "@/lib/utils";

type AuthMode = "password" | "magic";
type AuthTab = "signin" | "signup";

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-white flex items-center justify-center text-[#800020] font-bold">
          <Loader2 size={32} className="animate-spin text-[#800020]" />
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
  const initialError = searchParams.get("error");
  const supabase = createBrowserClient();

  const [authTab, setAuthTab] = useState<AuthTab>("signin");
  const [authMode, setAuthMode] = useState<AuthMode>("password");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(
    initialError ? { type: "err", text: "Authentication session expired or failed. Please sign in again." } : null
  );
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    document.title = authTab === "signin" ? "Sign In | MeetMate" : "Create Account | MeetMate";
  }, [authTab]);

  async function handlePasswordAuth(e: FormEvent) {
    e.preventDefault();
    setMessage(null);

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setMessage({ type: "err", text: "Please enter your email address." });
      return;
    }
    if (!password) {
      setMessage({ type: "err", text: "Please enter your password." });
      return;
    }

    startTransition(async () => {
      if (authTab === "signup") {
        if (password.length < 6) {
          setMessage({ type: "err", text: "Password must be at least 6 characters long." });
          return;
        }

        const cleanName = fullName.trim() || cleanEmail.split("@")[0];
        const { data, error } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: {
            data: {
              full_name: cleanName,
              display_name: cleanName,
            },
          },
        });

        if (error) {
          setMessage({ type: "err", text: error.message });
        } else if (isSupabaseConfigured() && !data.session) {
          setMessage({
            type: "ok",
            text: "Verification email sent. Please check your inbox and verify your address, then sign in.",
          });
          setAuthTab("signin");
        } else {
          router.push(redirectTo);
          router.refresh();
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });

        if (error) {
          setMessage({ type: "err", text: error.message });
        } else {
          router.push(redirectTo);
          router.refresh();
        }
      }
    });
  }

  async function handleMagicLinkAuth(e: FormEvent) {
    e.preventDefault();
    setMessage(null);

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setMessage({ type: "err", text: "Please enter your email address to receive a sign-in link." });
      return;
    }

    startTransition(async () => {
      const { error } = await supabase.auth.signInWithOtp({
        email: cleanEmail,
        options: {
          emailRedirectTo: `${location.origin}/auth/callback?next=${redirectTo}`,
        },
      });

      if (error) {
        setMessage({ type: "err", text: error.message });
      } else if (isSupabaseConfigured()) {
        setMessage({
          type: "ok",
          text: "A secure sign-in link has been sent to your inbox. Click the link to instantly access your workspace.",
        });
      } else {
        router.push(redirectTo);
        router.refresh();
      }
    });
  }

  return (
    <div className="min-h-screen bg-[#FFF5F7] flex flex-col justify-center items-center py-12 px-4 sm:px-6 lg:px-8 font-sans text-[#2B050D]">
      {/* Top Navbar / Brand Identity */}
      <header className="w-full max-w-5xl mb-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#800020] text-white shadow-md shadow-[#800020]/20">
            <Video size={22} strokeWidth={2.4} />
          </span>
          <div>
            <span className="text-2xl font-black tracking-tight text-[#800020]">
              Meet<span className="text-[#520919]">Mate</span>
            </span>
            <span className="block text-[11px] font-bold uppercase tracking-wider text-[#800020]/70">
              Enterprise Meeting Intelligence
            </span>
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-2 rounded-full border border-[#F0B8C4] bg-white px-3.5 py-1.5 text-xs font-semibold text-[#800020] shadow-sm">
          <ShieldCheck size={14} className="text-[#800020]" />
          <span>SOC-2 &amp; TLS 256-Bit Protected</span>
        </div>
      </header>

      {/* Main Dual-Column Enterprise Container */}
      <div className="w-full max-w-5xl overflow-hidden rounded-3xl border-2 border-[#800020]/20 bg-white shadow-2xl shadow-[#800020]/15 grid grid-cols-1 lg:grid-cols-12">
        {/* Left Column: Product Showcase & Brand Value (Burgundy) */}
        <div className="lg:col-span-5 bg-[#800020] text-white p-8 sm:p-10 flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-[#520919]">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-[#F7CBD4] backdrop-blur-sm border border-white/15">
              <Sparkles size={13} className="text-white" />
              <span>Next-Gen Video Workspace</span>
            </div>

            <div>
              <h2 className="text-3xl font-extrabold tracking-tight text-white leading-tight">
                Secure, Intelligent Meetings for Modern Teams
              </h2>
              <p className="mt-3 text-sm text-[#F7CBD4] leading-relaxed">
                Experience ultra-low latency WebRTC video, real-time multilingual transcription, and automated AI meeting intelligence.
              </p>
            </div>

            {/* Feature Highlights */}
            <div className="space-y-4 pt-2">
              <div className="flex items-start gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/15 text-white">
                  <Radio size={16} />
                </span>
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wide text-white">Ultra-HD Audio &amp; Video</h4>
                  <p className="text-xs text-[#F7CBD4]/90 mt-0.5">
                    LiveKit-powered multi-party conferencing with speaker pinning and screen share.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/15 text-white">
                  <Sparkles size={16} />
                </span>
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wide text-white">Live AI Speech Recognition</h4>
                  <p className="text-xs text-[#F7CBD4]/90 mt-0.5">
                    Real-time speech-to-text with multi-accent adaptation and automated summaries.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/15 text-white">
                  <Layers size={16} />
                </span>
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wide text-white">Collaborative Whiteboard &amp; Code</h4>
                  <p className="text-xs text-[#F7CBD4]/90 mt-0.5">
                    Integrated Monaco editor and interactive canvas for engineering reviews.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Trust Statement */}
          <div className="pt-8 mt-6 border-t border-white/15">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#F7CBD4]">
              <CheckCircle2 size={15} className="text-white shrink-0" />
              <span>Zero-knowledge encryption for private workspace audio &amp; chat.</span>
            </div>
          </div>
        </div>

        {/* Right Column: Professional Authentication Form (White) */}
        <div className="lg:col-span-7 bg-white p-8 sm:p-10 flex flex-col justify-center">
          <div className="max-w-md mx-auto w-full">
            {/* Tab Switcher: Sign In vs Create Account */}
            <div className="flex rounded-xl border border-[#F0B8C4] bg-[#FFF5F7] p-1 mb-6">
              <button
                type="button"
                onClick={() => {
                  setAuthTab("signin");
                  setMessage(null);
                }}
                className={cn(
                  "flex-1 py-2 text-xs font-extrabold rounded-lg transition-all cursor-pointer text-center",
                  authTab === "signin"
                    ? "bg-[#800020] text-white shadow-sm"
                    : "text-[#800020] hover:bg-white/60"
                )}
                id="tab-signin"
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthTab("signup");
                  setMessage(null);
                }}
                className={cn(
                  "flex-1 py-2 text-xs font-extrabold rounded-lg transition-all cursor-pointer text-center",
                  authTab === "signup"
                    ? "bg-[#800020] text-white shadow-sm"
                    : "text-[#800020] hover:bg-white/60"
                )}
                id="tab-signup"
              >
                Create Account
              </button>
            </div>

            {/* Header Titles */}
            <div className="mb-6">
              <h3 className="text-xl font-black tracking-tight text-[#2B050D]">
                {authTab === "signin"
                  ? authMode === "password"
                    ? "Sign in to your account"
                    : "Sign in with Magic Link"
                  : "Create your workspace account"}
              </h3>
              <p className="text-xs text-[#800020]/75 font-medium mt-1">
                {authTab === "signin"
                  ? "Enter your verified business email and password to continue."
                  : "Start collaborating with secure video, AI transcripts, and workspaces."}
              </p>
            </div>

            {/* Message Alert Banner */}
            {message && (
              <div
                className={cn(
                  "mb-5 rounded-xl border-2 px-4 py-3 text-xs font-bold flex items-start gap-2.5",
                  message.type === "ok"
                    ? "border-[#800020] bg-[#FFF0F3] text-[#800020]"
                    : "border-[#9C0E2E] bg-[#FFF0F3] text-[#9C0E2E]"
                )}
                role="alert"
                id="auth-alert-message"
              >
                <span className="shrink-0 mt-0.5">
                  {message.type === "ok" ? <CheckCircle2 size={16} /> : <ShieldCheck size={16} />}
                </span>
                <span className="leading-relaxed">{message.text}</span>
              </div>
            )}

            {/* Form Section */}
            {authMode === "password" ? (
              <form onSubmit={handlePasswordAuth} className="space-y-4">
                {/* Full Name (Sign Up only) */}
                {authTab === "signup" && (
                  <div className="space-y-1.5">
                    <label
                      htmlFor="full-name"
                      className="block text-xs font-bold uppercase tracking-wider text-[#800020]"
                    >
                      Full Name
                    </label>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#800020]/70">
                        <User size={16} />
                      </span>
                      <input
                        id="full-name"
                        type="text"
                        autoComplete="name"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="e.g. Alex Morgan"
                        className="w-full rounded-xl border-2 border-[#F0B8C4] bg-white py-2.5 pl-10 pr-3.5 text-sm font-semibold text-[#2B050D] placeholder-[#800020]/30 transition-colors focus:border-[#800020] focus:outline-none focus:ring-2 focus:ring-[#800020]/20"
                      />
                    </div>
                  </div>
                )}

                {/* Email Field */}
                <div className="space-y-1.5">
                  <label
                    htmlFor="email"
                    className="block text-xs font-bold uppercase tracking-wider text-[#800020]"
                  >
                    Work Email
                  </label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#800020]/70">
                      <Mail size={16} />
                    </span>
                    <input
                      id="email"
                      type="email"
                      autoComplete="email"
                      autoCapitalize="none"
                      autoCorrect="off"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@company.com"
                      className="w-full rounded-xl border-2 border-[#F0B8C4] bg-white py-2.5 pl-10 pr-3.5 text-sm font-semibold text-[#2B050D] placeholder-[#800020]/30 transition-colors focus:border-[#800020] focus:outline-none focus:ring-2 focus:ring-[#800020]/20"
                    />
                  </div>
                </div>

                {/* Password Field */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label
                      htmlFor="password"
                      className="block text-xs font-bold uppercase tracking-wider text-[#800020]"
                    >
                      Password
                    </label>
                    {authTab === "signin" && (
                      <button
                        type="button"
                        onClick={() => {
                          setAuthMode("magic");
                          setMessage(null);
                        }}
                        className="text-[11px] font-bold text-[#800020] hover:underline cursor-pointer"
                      >
                        Forgot / Passwordless?
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#800020]/70">
                      <Lock size={16} />
                    </span>
                    <input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete={authTab === "signin" ? "current-password" : "new-password"}
                      required
                      minLength={authTab === "signup" ? 6 : undefined}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={authTab === "signup" ? "Create a strong password (min 6 chars)" : "Enter your password"}
                      className="w-full rounded-xl border-2 border-[#F0B8C4] bg-white py-2.5 pl-10 pr-10 text-sm font-semibold text-[#2B050D] placeholder-[#800020]/30 transition-colors focus:border-[#800020] focus:outline-none focus:ring-2 focus:ring-[#800020]/20"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#800020]/60 hover:text-[#800020] cursor-pointer p-1"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                {/* Remember Me / Checkbox */}
                {authTab === "signin" && (
                  <div className="flex items-center justify-between pt-1">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                        className="h-4 w-4 rounded border-[#F0B8C4] text-[#800020] focus:ring-[#800020] cursor-pointer"
                      />
                      <span className="text-xs font-semibold text-[#2B050D]">Keep me signed in</span>
                    </label>
                  </div>
                )}

                {/* Submit Action */}
                <button
                  type="submit"
                  disabled={isPending}
                  className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-[#800020] px-4 py-3 text-sm font-bold text-white shadow-lg shadow-[#800020]/20 transition-all hover:bg-[#600018] active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-[#800020] disabled:opacity-60 cursor-pointer"
                  id="submit-auth-btn"
                >
                  {isPending ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      <span>Authenticating...</span>
                    </>
                  ) : (
                    <>
                      <span>{authTab === "signin" ? "Sign In to Workspace" : "Create Account & Continue"}</span>
                      <ArrowRight size={16} />
                    </>
                  )}
                </button>
              </form>
            ) : (
              /* Passwordless Magic Link Form */
              <form onSubmit={handleMagicLinkAuth} className="space-y-4">
                <div className="space-y-1.5">
                  <label
                    htmlFor="magic-email"
                    className="block text-xs font-bold uppercase tracking-wider text-[#800020]"
                  >
                    Email Address
                  </label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#800020]/70">
                      <Mail size={16} />
                    </span>
                    <input
                      id="magic-email"
                      type="email"
                      autoComplete="email"
                      autoCapitalize="none"
                      autoCorrect="off"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@company.com"
                      className="w-full rounded-xl border-2 border-[#F0B8C4] bg-white py-2.5 pl-10 pr-3.5 text-sm font-semibold text-[#2B050D] placeholder-[#800020]/30 transition-colors focus:border-[#800020] focus:outline-none focus:ring-2 focus:ring-[#800020]/20"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isPending}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#800020] px-4 py-3 text-sm font-bold text-white shadow-lg shadow-[#800020]/20 transition-all hover:bg-[#600018] active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-[#800020] disabled:opacity-60 cursor-pointer"
                  id="submit-magic-btn"
                >
                  {isPending ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      <span>Sending secure link...</span>
                    </>
                  ) : (
                    <>
                      <KeyRound size={16} />
                      <span>Send Magic Sign-In Link</span>
                    </>
                  )}
                </button>

                <div className="text-center pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode("password");
                      setMessage(null);
                    }}
                    className="text-xs font-bold text-[#800020] hover:underline cursor-pointer"
                  >
                    Return to password login
                  </button>
                </div>
              </form>
            )}

            {/* Alternative Auth Mode Switcher */}
            {authMode === "password" && (
              <div className="mt-6 pt-5 border-t border-[#F0B8C4]">
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode("magic");
                    setMessage(null);
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-[#F0B8C4] bg-white px-4 py-2.5 text-xs font-bold text-[#800020] transition-colors hover:bg-[#FFF5F7] hover:border-[#800020] cursor-pointer shadow-sm"
                  id="switch-to-magic"
                >
                  <KeyRound size={15} />
                  <span>Email me a passwordless login link</span>
                </button>
              </div>
            )}

            {/* Compliance & Security Footer */}
            <div className="mt-8 pt-4 flex flex-col items-center justify-center gap-1.5 text-center text-[11px] font-semibold text-[#800020]/60">
              <div className="flex items-center gap-2">
                <ShieldCheck size={13} className="text-[#800020]" />
                <span>Enterprise Grade Security • 256-Bit SSL Encryption</span>
              </div>
              <p>Protected by reCAPTCHA Enterprise and MeetMate Privacy Standards.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Global Footer */}
      <footer className="mt-8 text-center text-xs font-semibold text-[#800020]/75">
        &copy; {new Date().getFullYear()} MeetMate Inc. All rights reserved. • Pure White &amp; Burgundy Workspace.
      </footer>
    </div>
  );
}
