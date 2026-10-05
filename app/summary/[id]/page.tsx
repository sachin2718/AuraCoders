"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  FileText,
  Sparkles,
  CheckCircle2,
  HelpCircle,
  Clock,
  Calendar,
  AlertCircle,
  AlertTriangle,
  RotateCw,
  ArrowLeft,
  User,
  Quote,
  Check,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { MeetingDetail, ActionItem, Priority } from "@/lib/types";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast, Toaster } from "@/components/ui/toast";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function MeetingSummaryPage({ params }: PageProps) {
  const router = useRouter();
  const resolvedParams = React.use(params);
  const meetingId = resolvedParams.id;

  const [detail, setDetail] = React.useState<MeetingDetail | null>(null);
  const [status, setStatus] = React.useState<
    "loading" | "processing" | "ready" | "failed" | "timeout"
  >("loading");
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = React.useState(0);

  // ── Timestamp Formatter: milliseconds -> mm:ss ──────────────────────
  const formatTimestamp = (tMs?: number | null): string => {
    if (tMs == null || isNaN(tMs)) return "00:00";
    const totalSeconds = Math.max(0, Math.floor(tMs / 1000));
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // ── Date Formatter ──────────────────────────────────────────────────
  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return dateStr;
    }
  };

  // ── Polling & Data Fetcher ──────────────────────────────────────────
  const fetchMeeting = React.useCallback(
    async (isPolling = false) => {
      try {
        if (!isPolling) setStatus("loading");
        const res = await api.getMeeting(meetingId);
        setDetail(res);

        if (res.meeting.status === "ready") {
          setStatus("ready");
          setErrorMessage(null);
          document.title = `${res.meeting.title} | MeetMate`;
        } else if (res.meeting.status === "failed") {
          setStatus("failed");
          setErrorMessage("Meeting summary generation failed.");
          document.title = `Error | Meeting Summary | MeetMate`;
        } else {
          // Status is "processing" or "live"
          setStatus("processing");
          document.title = `Writing Notes... | MeetMate`;
        }
      } catch (err: unknown) {
        const msg =
          err instanceof ApiError
            ? err.message
            : "Failed to fetch meeting summary.";
        setErrorMessage(msg);
        setStatus("failed");
      }
    },
    [meetingId]
  );

  // Initial load
  React.useEffect(() => {
    fetchMeeting(false);
  }, [fetchMeeting]);

  // Polling loop: every 2s while status === "processing"
  React.useEffect(() => {
    if (status !== "processing") return;

    const interval = setInterval(() => {
      setElapsedSeconds((prev) => {
        if (prev >= 90) {
          // 90s timeout constraint
          clearInterval(interval);
          setStatus("timeout");
          return prev;
        }
        return prev + 2;
      });

      fetchMeeting(true);
    }, 2000);

    return () => clearInterval(interval);
  }, [status, fetchMeeting]);

  // Retry Handler
  const handleRetry = async () => {
    setElapsedSeconds(0);
    setErrorMessage(null);
    if (process.env.NEXT_PUBLIC_MOCK === "true") {
      api.setMockStatus(meetingId, "processing");
      fetchMeeting(false);
      return;
    }

    try {
      await api.endMeeting(meetingId);
      await fetchMeeting(false);
    } catch (err: unknown) {
      const message = err instanceof ApiError ? err.message : "Could not retry note generation.";
      setErrorMessage(message);
      setStatus("failed");
    }
  };

  // Dev simulation helpers for testing mock mode
  const handleSimulateStatus = (newStatus: "processing" | "ready" | "failed") => {
    api.setMockStatus(meetingId, newStatus);
    setElapsedSeconds(0);
    if (newStatus === "processing") {
      setStatus("processing");
      toast({
        title: "Simulation Started",
        description: "Simulating processing status. Polling every 2s...",
      });
    } else if (newStatus === "ready") {
      fetchMeeting(false);
    } else {
      setStatus("failed");
      setErrorMessage("Simulated meeting synthesis failure.");
    }
  };

  // ── Priority Badge Helper ───────────────────────────────────────────
  const renderPriorityBadge = (priority: Priority) => {
    switch (priority) {
      case "high":
        return (
          <Badge
            variant="outline"
            className="border-[#722F37]/30 bg-[#FAF0F2] text-[#722F37] dark:bg-[#341B21] dark:text-[#E8A2B0] font-semibold text-[11px]"
          >
            High
          </Badge>
        );
      case "medium":
        return (
          <Badge
            variant="outline"
            className="border-[#8C5824]/30 bg-[#FAF2E6] text-[#8C5824] dark:bg-[#342414] dark:text-[#DEAC78] font-semibold text-[11px]"
          >
            Medium
          </Badge>
        );
      case "low":
        return (
          <Badge
            variant="outline"
            className="border-[#4A3026]/20 bg-[#EFE8E1] text-[#4A3026] dark:bg-[#2C1D18] dark:text-[#C5B3AC] font-semibold text-[11px]"
          >
            Low
          </Badge>
        );
      default:
        return <Badge variant="secondary">{priority}</Badge>;
    }
  };

  // ── SCREEN 1: While Processing (Friendly Animated Notes Screen) ──────
  if (status === "processing" || status === "loading") {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 py-12 text-center">
        <Toaster />

        {/* Central Card with Solid Styling (No Gradients) */}
        <div className="w-full max-w-lg rounded-2xl border border-[#E5DDD5] bg-white p-8 shadow-sm dark:border-[#3E2D28] dark:bg-[#231815]">
          {/* Animated Icon Container */}
          <div className="relative mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-[#FAF0F2] text-[#722F37] dark:bg-[#361A21] dark:text-[#E8A2B0]">
            <FileText className="h-10 w-10 animate-bounce" />
            <span className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-[#722F37] text-white shadow-sm">
              <Sparkles className="h-3.5 w-3.5" />
            </span>
          </div>

          <h2 className="text-2xl font-bold tracking-tight text-[#2A1B18] dark:text-[#F5EFEB]">
            MeetMate is writing your notes…
          </h2>
          <p className="mt-2 text-sm text-[#7A625A] dark:text-[#BCAAA4]">
            Synthesizing speaker transcripts, extracting consensus decisions, and organizing your action items.
          </p>

          {/* Animated Step Indicators */}
          <div className="mt-8 space-y-3 text-left">
            <div className="flex items-center gap-3 rounded-lg border border-[#E5DDD5] bg-[#FAF8F5] p-3 text-xs dark:border-[#3E2D28] dark:bg-[#1A120E]">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#722F37] text-white">
                <Check className="h-3 w-3" />
              </span>
              <span className="font-medium text-[#2A1B18] dark:text-[#F5EFEB]">
                Audio & Web Speech segments transcribed
              </span>
            </div>

            <div className="flex items-center gap-3 rounded-lg border border-[#722F37]/30 bg-[#FAF0F2] p-3 text-xs dark:border-[#722F37]/50 dark:bg-[#361A21]">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#722F37] text-white">
                <RotateCw className="h-3 w-3 animate-spin" />
              </span>
              <span className="font-semibold text-[#722F37] dark:text-[#E8A2B0]">
                Generating TL;DR, decisions & quotes with Gemini…
              </span>
            </div>

            <div className="flex items-center gap-3 rounded-lg border border-dashed border-[#D7CCC8] p-3 text-xs text-[#7A625A] dark:border-[#4A3730] dark:text-[#8D766E]">
              <span className="h-5 w-5 shrink-0 rounded-full border border-[#D7CCC8] dark:border-[#4A3730]" />
              <span>Grouping action items by participant</span>
            </div>
          </div>

          {/* Polling Timer Status */}
          <div className="mt-6 flex items-center justify-center gap-2 text-xs text-[#7A625A] dark:text-[#8D766E]">
            <Clock className="h-3.5 w-3.5 animate-spin" />
            <span>Polling every 2s • Elapsed: {elapsedSeconds}s (timeout in 90s)</span>
          </div>

          {/* Dev Quick Action Pill */}
          {process.env.NEXT_PUBLIC_MOCK === "true" && (
            <div className="mt-6 border-t border-[#E5DDD5] pt-4 dark:border-[#3E2D28]">
              <p className="text-[11px] font-medium text-[#7A625A] dark:text-[#8D766E]">
                Mock Mode Controls:
              </p>
              <div className="mt-2 flex justify-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleSimulateStatus("ready")}
                  className="h-7 text-xs border-[#D7CCC8] text-[#722F37] hover:bg-[#FAF0F2]"
                >
                  Fast-forward to Ready
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleSimulateStatus("failed")}
                  className="h-7 text-xs border-[#D7CCC8] text-[#8A2525] hover:bg-[#FDF0F0]"
                >
                  Test Failed State
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── SCREEN 2: Timeout Screen (After 90s) ─────────────────────────────
  if (status === "timeout") {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 py-12 text-center">
        <Toaster />
        <Card className="w-full max-w-md border border-[#E5DDD5] bg-white p-8 dark:border-[#3E2D28] dark:bg-[#231815]">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#FAF2E6] text-[#8C5824] dark:bg-[#342414] dark:text-[#DEAC78]">
            <Clock className="h-7 w-7" />
          </div>
          <CardTitle className="text-xl">Note Generation Timed Out</CardTitle>
          <CardDescription className="mt-2">
            The notes are taking longer than 90 seconds. The server might still be finalizing the summary.
          </CardDescription>
          <div className="mt-6 flex justify-center gap-3">
            <Button
              variant="outline"
              onClick={() => router.push("/dashboard")}
              className="border-[#D7CCC8] text-[#2A1B18]"
            >
              Back to Dashboard
            </Button>
            <Button
              onClick={handleRetry}
              className="bg-[#722F37] text-white hover:bg-[#5A1827]"
            >
              <RotateCw className="mr-2 h-4 w-4" />
              Retry Now
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  // ── SCREEN 3: Failed Screen ──────────────────────────────────────────
  if (status === "failed" || !detail) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 py-12 text-center">
        <Toaster />
        <Card className="w-full max-w-md border border-[#8A2525]/30 bg-white p-8 dark:border-[#8A2525]/50 dark:bg-[#231815]">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#FDF0F0] text-[#8A2525] dark:bg-[#381B1B] dark:text-[#E69393]">
            <AlertTriangle className="h-7 w-7" />
          </div>
          <CardTitle className="text-xl text-[#8A2525] dark:text-[#E69393]">
            Summary Generation Failed
          </CardTitle>
          <CardDescription className="mt-2">
            {errorMessage ||
              "MeetMate encountered an issue while transcribing or generating notes for this meeting."}
          </CardDescription>
          <div className="mt-6 flex justify-center gap-3">
            <Button
              variant="outline"
              onClick={() => router.push("/dashboard")}
              className="border-[#D7CCC8] text-[#2A1B18]"
            >
              Back to Dashboard
            </Button>
            <Button
              onClick={handleRetry}
              className="bg-[#722F37] text-white hover:bg-[#5A1827]"
            >
              <RotateCw className="mr-2 h-4 w-4" />
              Retry Synthesis
            </Button>
          </div>

          {process.env.NEXT_PUBLIC_MOCK === "true" && (
            <div className="mt-6 border-t border-[#E5DDD5] pt-4 dark:border-[#3E2D28]">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleSimulateStatus("ready")}
                className="text-xs text-[#722F37] hover:bg-[#FAF0F2]"
              >
                Switch to Ready State (Mock)
              </Button>
            </div>
          )}
        </Card>
      </div>
    );
  }

  // ── SCREEN 4: Ready State (Full Meeting Summary & Action Items) ──────
  const { meeting, participants, summary, action_items } = detail;

  // Group action items by owner (handling Unassigned)
  const groupedActionItems = (action_items || []).reduce(
    (acc, item) => {
      const owner = item.owner_name?.trim() || "Unassigned";
      if (!acc[owner]) acc[owner] = [];
      acc[owner].push(item);
      return acc;
    },
    {} as Record<string, ActionItem[]>
  );

  // Sort owners so Unassigned is clearly placed or at the end
  const sortedOwners = Object.keys(groupedActionItems).sort((a, b) => {
    if (a === "Unassigned") return 1;
    if (b === "Unassigned") return -1;
    return a.localeCompare(b);
  });

  return (
    <div className="space-y-8 pb-16">
      <Toaster />

      {/* Top Navigation & Verification Badge */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/dashboard")}
          className="w-fit text-[#6B534B] hover:bg-[#EFE8E1] hover:text-[#2A1B18] -ml-2"
        >
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Back to Dashboard
        </Button>

        {/* Small Required Label */}
        <div className="flex items-center gap-1.5 rounded-full border border-[#D7CCC8] bg-[#FAF8F5] px-3 py-1 text-xs font-medium text-[#7A4B3A] dark:border-[#4A3730] dark:bg-[#201512] dark:text-[#D4A392]">
          <Sparkles className="h-3.5 w-3.5 text-[#722F37] dark:text-[#E8A2B0]" />
          <span>AI-generated — please verify</span>
        </div>
      </div>

      {/* Meeting Header Card */}
      <Card className="border border-[#E5DDD5] bg-white p-6 shadow-sm dark:border-[#3E2D28] dark:bg-[#231815]">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#2A1B18] dark:text-[#F5EFEB]">
                {meeting.title}
              </h1>
              <span className="rounded bg-[#EFE8E1] px-2.5 py-0.5 font-mono text-xs font-semibold text-[#5D3D2E] dark:bg-[#34221B] dark:text-[#EFE8E1]">
                {meeting.code}
              </span>
              <Badge
                variant="ready"
                className="bg-[#FAF0F2] text-[#722F37] border-[#722F37]/30"
              >
                Ready
              </Badge>
            </div>

            <div className="flex flex-wrap items-center gap-4 text-xs text-[#7A625A] dark:text-[#BCAAA4]">
              <span className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" />
                {formatDate(meeting.started_at)}
              </span>
              <span>•</span>
              <span className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" />
                45 mins duration
              </span>
            </div>
          </div>

          {/* Participants Avatars */}
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-[#7A625A] dark:text-[#BCAAA4]">
              Participants ({participants.length}):
            </span>
            <div className="flex flex-wrap gap-1.5">
              {participants.map((p) => (
                <span
                  key={p.user_id}
                  className="inline-flex items-center gap-1 rounded-full border border-[#E5DDD5] bg-[#FAF8F5] px-2.5 py-0.5 text-xs text-[#2A1B18] dark:border-[#3E2D28] dark:bg-[#1A120E] dark:text-[#F5EFEB]"
                >
                  <User className="h-3 w-3 text-[#722F37]" />
                  {p.display_name}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Dev Mode Simulation Toggles for Evaluation */}
        {process.env.NEXT_PUBLIC_MOCK === "true" && (
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[#E5DDD5] pt-3 text-xs text-[#7A625A] dark:border-[#3E2D28]">
            <span className="font-semibold">Simulate Mode:</span>
            <button
              onClick={() => handleSimulateStatus("processing")}
              className="rounded bg-[#FAF0F2] px-2 py-0.5 text-[#722F37] hover:bg-[#F2DCE1] cursor-pointer"
            >
              Test Processing Screen
            </button>
            <button
              onClick={() => handleSimulateStatus("failed")}
              className="rounded bg-[#FDF0F0] px-2 py-0.5 text-[#8A2525] hover:bg-[#F8D2D2] cursor-pointer"
            >
              Test Failed Screen
            </button>
          </div>
        )}
      </Card>

      {/* TL;DR Card */}
      {summary && (
        <Card className="border border-[#E5DDD5] bg-white shadow-sm dark:border-[#3E2D28] dark:bg-[#231815]">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2 text-[#722F37] dark:text-[#E8A2B0]">
              <Sparkles className="h-5 w-5" />
              <CardTitle className="text-lg text-[#722F37] dark:text-[#E8A2B0]">
                TL;DR & Executive Summary
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-relaxed text-[#2A1B18] dark:text-[#F5EFEB]">
              {summary.tldr}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Grid: Key Points & Decisions / Questions */}
      {summary && (
        <div className="grid gap-6 md:grid-cols-2">
          {/* Key Points */}
          <Card className="border border-[#E5DDD5] bg-white shadow-sm dark:border-[#3E2D28] dark:bg-[#231815]">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-[#7A4B3A]" />
                <CardTitle className="text-base font-semibold">
                  Key Discussion Points
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                {summary.key_points.map((point, idx) => (
                  <li key={idx} className="flex items-start gap-3 text-sm">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#FAF0F2] text-xs font-bold text-[#722F37] dark:bg-[#361A21] dark:text-[#E8A2B0]">
                      {idx + 1}
                    </span>
                    <span className="text-[#2A1B18] dark:text-[#F5EFEB] leading-relaxed">
                      {point}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {/* Decisions & Open Questions */}
          <div className="space-y-6">
            {/* Decisions */}
            <Card className="border border-[#E5DDD5] bg-white shadow-sm dark:border-[#3E2D28] dark:bg-[#231815]">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-[#722F37] dark:text-[#E8A2B0]" />
                  <CardTitle className="text-base font-semibold text-[#722F37] dark:text-[#E8A2B0]">
                    Decisions Reached
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2.5">
                  {summary.decisions.map((dec, idx) => (
                    <li key={idx} className="flex items-start gap-2.5 text-sm">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#722F37] dark:text-[#E8A2B0]" />
                      <span className="text-[#2A1B18] dark:text-[#F5EFEB]">
                        {dec}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            {/* Open Questions */}
            <Card className="border border-[#E5DDD5] bg-white shadow-sm dark:border-[#3E2D28] dark:bg-[#231815]">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <HelpCircle className="h-4 w-4 text-[#8C5824] dark:text-[#DEAC78]" />
                  <CardTitle className="text-base font-semibold text-[#8C5824] dark:text-[#DEAC78]">
                    Open Questions
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2.5">
                  {summary.open_questions.map((q, idx) => (
                    <li key={idx} className="flex items-start gap-2.5 text-sm">
                      <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#8C5824] dark:text-[#DEAC78]" />
                      <span className="text-[#2A1B18] dark:text-[#F5EFEB]">
                        {q}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Action Items Section Grouped by Owner */}
      <div className="space-y-4">
        <div className="border-b border-[#E5DDD5] pb-3 dark:border-[#382721]">
          <h2 className="text-xl font-bold text-[#2A1B18] dark:text-[#F5EFEB]">
            Action Items & Deliverables
          </h2>
          <p className="text-xs text-[#7A625A] dark:text-[#BCAAA4]">
            Extracted commitments grouped by assignee with exact transcript quotes and timestamps.
          </p>
        </div>

        {/* Grouped Action Items List */}
        <div className="space-y-6">
          {sortedOwners.map((owner) => {
            const items = groupedActionItems[owner];
            const isUnassigned = owner === "Unassigned";

            return (
              <div
                key={owner}
                className={`overflow-hidden rounded-xl border transition-all ${
                  isUnassigned
                    ? "border-amber-300/80 bg-[#FFFDF5] shadow-sm dark:border-amber-700/60 dark:bg-[#261E10]"
                    : "border-[#E5DDD5] bg-white shadow-sm dark:border-[#3E2D28] dark:bg-[#231815]"
                }`}
              >
                {/* Group Header */}
                <div
                  className={`flex items-center justify-between border-b px-4 py-3 sm:px-6 ${
                    isUnassigned
                      ? "border-amber-200/80 bg-amber-50/80 dark:border-amber-800/60 dark:bg-amber-950/40"
                      : "border-[#F0EAE3] bg-[#FAF8F5] dark:border-[#33221B] dark:bg-[#1E1410]"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span
                      className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                        isUnassigned
                          ? "bg-amber-200 text-amber-900 dark:bg-amber-800 dark:text-amber-100"
                          : "bg-[#722F37] text-white"
                      }`}
                    >
                      {isUnassigned ? "?" : owner.slice(0, 2).toUpperCase()}
                    </span>
                    <h3
                      className={`text-sm font-bold ${
                        isUnassigned
                          ? "text-amber-900 dark:text-amber-200"
                          : "text-[#2A1B18] dark:text-[#F5EFEB]"
                      }`}
                    >
                      {owner}
                    </h3>
                  </div>

                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      isUnassigned
                        ? "bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-900/60 dark:text-amber-200"
                        : "bg-[#EFE8E1] text-[#4A3026] dark:bg-[#2F211C] dark:text-[#EFE8E1]"
                    }`}
                  >
                    {isUnassigned
                      ? "Needs Assignment (1 item)"
                      : `${items.length} ${items.length === 1 ? "task" : "tasks"}`}
                  </span>
                </div>

                {/* Table for Desktop / Large Screens */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-[#F0EAE3] text-xs font-semibold uppercase text-[#7A625A] dark:border-[#33221B] dark:text-[#BCAAA4]">
                      <tr>
                        <th className="px-6 py-3">Deliverable & Source Quote</th>
                        <th className="px-4 py-3">Due Date</th>
                        <th className="px-4 py-3">Priority</th>
                        <th className="px-6 py-3 text-right">Timestamp</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F0EAE3] dark:divide-[#33221B]">
                      {items.map((item) => (
                        <tr
                          key={item.id}
                          className="hover:bg-[#FAF8F5] dark:hover:bg-[#1E1410] transition-colors"
                        >
                          {/* Title & Quote */}
                          <td className="px-6 py-4">
                            <div className="font-semibold text-[#2A1B18] dark:text-[#F5EFEB]">
                              {item.title}
                            </div>
                            {item.source_quote && (
                              <div className="mt-1.5 flex items-start gap-1.5 text-xs text-[#7A625A] dark:text-[#BCAAA4] italic">
                                <Quote className="h-3 w-3 shrink-0 text-[#722F37] mt-0.5" />
                                <span>&ldquo;{item.source_quote}&rdquo;</span>
                              </div>
                            )}
                          </td>

                          {/* Due Date */}
                          <td className="px-4 py-4 whitespace-nowrap text-xs text-[#7A625A] dark:text-[#BCAAA4]">
                            {item.due_date ? (
                              <span className="flex items-center gap-1 font-medium">
                                <Calendar className="h-3.5 w-3.5" />
                                {item.due_date}
                              </span>
                            ) : (
                              <span className="italic text-[#A8968F]">
                                No date
                              </span>
                            )}
                          </td>

                          {/* Priority */}
                          <td className="px-4 py-4 whitespace-nowrap">
                            {renderPriorityBadge(item.priority)}
                          </td>

                          {/* Timestamp */}
                          <td className="px-6 py-4 whitespace-nowrap text-right">
                            <span className="inline-flex items-center gap-1 rounded bg-[#EFE8E1] px-2 py-0.5 font-mono text-xs font-semibold text-[#5D3D2E] dark:bg-[#34221B] dark:text-[#EFE8E1]">
                              <Clock className="h-3 w-3" />
                              {formatTimestamp(item.t_ms)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Card Stack for Mobile Phone Width (< 768px) */}
                <div className="block md:hidden divide-y divide-[#F0EAE3] dark:divide-[#33221B]">
                  {items.map((item) => (
                    <div key={item.id} className="p-4 space-y-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="text-sm font-semibold text-[#2A1B18] dark:text-[#F5EFEB]">
                          {item.title}
                        </h4>
                        {renderPriorityBadge(item.priority)}
                      </div>

                      {item.source_quote && (
                        <div className="rounded-lg bg-[#FAF8F5] p-2.5 text-xs text-[#7A625A] italic dark:bg-[#1A120E] dark:text-[#BCAAA4]">
                          <div className="flex items-start gap-1.5">
                            <Quote className="h-3 w-3 shrink-0 text-[#722F37] mt-0.5" />
                            <span>&ldquo;{item.source_quote}&rdquo;</span>
                          </div>
                        </div>
                      )}

                      <div className="flex items-center justify-between text-xs text-[#7A625A] dark:text-[#BCAAA4] pt-1">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5" />
                          {item.due_date || "No due date"}
                        </span>

                        <span className="inline-flex items-center gap-1 rounded bg-[#EFE8E1] px-2 py-0.5 font-mono text-[11px] font-semibold text-[#5D3D2E] dark:bg-[#34221B] dark:text-[#EFE8E1]">
                          <Clock className="h-3 w-3" />
                          {formatTimestamp(item.t_ms)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
