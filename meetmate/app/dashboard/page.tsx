"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Video,
  PlusCircle,
  LogIn,
  Sparkles,
  Calendar,
  Clock,
  ArrowRight,
  Loader2,
  FolderOpen,
  RotateCw,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { MeetingListItem, MeetingStatus } from "@/lib/types";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast, Toaster } from "@/components/ui/toast";

export default function DashboardPage() {
  const router = useRouter();

  // ── Form States ─────────────────────────────────────────────────────
  const [newTitle, setNewTitle] = React.useState("");
  const [joinCode, setJoinCode] = React.useState("");
  const [isCreating, setIsCreating] = React.useState(false);
  const [isJoining, setIsJoining] = React.useState(false);
  const [isLoadingSample, setIsLoadingSample] = React.useState(false);

  // ── Past Meetings List ──────────────────────────────────────────────
  const [meetings, setMeetings] = React.useState<MeetingListItem[]>([]);
  const [isLoadingMeetings, setIsLoadingMeetings] = React.useState(true);

  React.useEffect(() => {
    document.title = "Dashboard | MeetMate";
  }, []);

  const fetchMeetings = React.useCallback(async () => {
    try {
      setIsLoadingMeetings(true);
      const list = await api.listMeetings();
      setMeetings(list);
    } catch (err: unknown) {
      const message =
        err instanceof ApiError ? err.message : "Failed to load past meetings";
      toast({
        title: "Error loading meetings",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsLoadingMeetings(false);
    }
  }, []);

  React.useEffect(() => {
    fetchMeetings();
  }, [fetchMeetings]);

  // ── Feature 1: Create New Meeting ──────────────────────────────────
  async function handleCreateMeeting(e: React.FormEvent) {
    e.preventDefault();
    const title = newTitle.trim() || "Untitled Meeting";
    try {
      setIsCreating(true);
      const { code } = await api.createMeeting(title);
      toast({
        title: "Meeting Created",
        description: `Room code: ${code}. Redirecting...`,
        variant: "success",
      });
      router.push(`/meeting/${encodeURIComponent(code)}`);
    } catch (err: unknown) {
      const message =
        err instanceof ApiError ? err.message : "Could not create meeting";
      toast({
        title: "Failed to create meeting",
        description: message,
        variant: "destructive",
      });
      setIsCreating(false);
    }
  }

  // ── Feature 2: Join Meeting with Code ──────────────────────────────
  function handleJoinCode(e: React.FormEvent) {
    e.preventDefault();
    const code = joinCode.trim();
    if (!code) {
      toast({
        title: "Meeting Code Required",
        description: "Please enter a valid meeting code to join.",
        variant: "destructive",
      });
      return;
    }
    setIsJoining(true);
    router.push(`/meeting/${encodeURIComponent(code)}`);
  }

  // ── Feature 4: Load Sample Meeting ─────────────────────────────────
  async function handleLoadSample() {
    try {
      setIsLoadingSample(true);
      const { id } = await api.createMeeting("Sample: Sprint Planning & AI Sync");
      await api.loadSample(id, "sample-sprint-sync");
      toast({
        title: "Sample Loaded",
        description: "Generating AI meeting summary and action items...",
        variant: "success",
      });
      router.push(`/summary/${encodeURIComponent(id)}`);
    } catch (err: unknown) {
      const message =
        err instanceof ApiError ? err.message : "Failed to load sample meeting";
      toast({
        title: "Sample Load Error",
        description: message,
        variant: "destructive",
      });
      setIsLoadingSample(false);
    }
  }

  // ── Badge Renderer ──────────────────────────────────────────────────
  function renderStatusBadge(status: MeetingStatus) {
    switch (status) {
      case "live":
        return (
          <Badge variant="live" className="gap-1.5 font-medium">
            <span className="h-1.5 w-1.5 rounded-full bg-[#7A4B3A] animate-pulse" />
            Live Now
          </Badge>
        );
      case "processing":
        return (
          <Badge variant="processing" className="gap-1.5 font-medium">
            <Loader2 className="h-3 w-3 animate-spin" />
            Processing
          </Badge>
        );
      case "ready":
        return (
          <Badge variant="ready" className="gap-1.5 font-medium">
            Ready
          </Badge>
        );
      case "failed":
        return (
          <Badge variant="failed" className="gap-1.5 font-medium">
            Failed
          </Badge>
        );
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  }

  // Safe date formatter for client rendering
  function formatDate(dateStr: string) {
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
  }

  return (
    <div className="space-y-8 pb-12">
      <Toaster />

      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-[#2A1B18] dark:text-[#F5EFEB]">
            Meeting Workspace
          </h1>
          <p className="text-sm text-[#7A625A] dark:text-[#BCAAA4]">
            Start instant calls, join via room code, or review past AI summaries and action items.
          </p>
        </div>

        {/* Feature 4: Load Sample Meeting Button (Solid White & Brown styling) */}
        <div>
          <Button
            onClick={handleLoadSample}
            disabled={isLoadingSample}
            variant="outline"
            className="border-[#D7CCC8] bg-[#FAF8F5] text-[#722F37] hover:bg-[#EFE8E1] hover:text-[#5A1827] dark:border-[#4A3730] dark:bg-[#231815] dark:text-[#E8A2B0] dark:hover:bg-[#2F211C]"
          >
            {isLoadingSample ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin text-[#722F37]" />
                Preparing Sample...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 text-[#722F37] dark:text-[#E8A2B0]" />
                Load sample meeting
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Action Cards Grid - Flat, Solid White cards with Warm Brown Borders */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Feature 1: New Meeting Card */}
        <Card className="border border-[#E5DDD5] bg-white shadow-sm dark:border-[#3E2D28] dark:bg-[#231815]">
          <CardHeader>
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#FAF0F2] text-[#722F37] dark:bg-[#361A21] dark:text-[#E8A2B0]">
                <PlusCircle className="h-5 w-5" />
              </span>
              <div>
                <CardTitle>New Meeting</CardTitle>
                <CardDescription>
                  Create an instant AI-transcribed video room
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateMeeting} className="flex flex-col gap-3 sm:flex-row">
              <Input
                placeholder="Meeting title (e.g. Q4 Strategy Review)"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                disabled={isCreating}
                className="flex-1"
              />
              <Button type="submit" disabled={isCreating} className="shrink-0 bg-[#722F37] hover:bg-[#5A1827] text-white">
                {isCreating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Starting...
                  </>
                ) : (
                  <>
                    <Video className="h-4 w-4" />
                    Start Meeting
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Feature 2: Join with Code Card */}
        <Card className="border border-[#E5DDD5] bg-white shadow-sm dark:border-[#3E2D28] dark:bg-[#231815]">
          <CardHeader>
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#EFE8E1] text-[#4A3026] dark:bg-[#33221C] dark:text-[#EFE8E1]">
                <LogIn className="h-5 w-5" />
              </span>
              <div>
                <CardTitle>Join with Code</CardTitle>
                <CardDescription>
                  Enter an existing meeting code or invite link
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleJoinCode} className="flex flex-col gap-3 sm:flex-row">
              <Input
                placeholder="e.g. DEMO-882"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                disabled={isJoining}
                className="font-mono uppercase tracking-wider flex-1"
              />
              <Button
                type="submit"
                variant="secondary"
                disabled={isJoining || !joinCode.trim()}
                className="shrink-0"
              >
                {isJoining ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Joining...
                  </>
                ) : (
                  <>
                    Join Room
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      {/* Feature 3: Past Meetings Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-[#E5DDD5] pb-3 dark:border-[#382721]">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-[#7A625A] dark:text-[#BCAAA4]" />
              <h2 className="text-xl font-semibold text-[#2A1B18] dark:text-[#F5EFEB]">
                Past Meetings
              </h2>
              {!isLoadingMeetings && meetings.length > 0 && (
                <span className="rounded-full bg-[#EFE8E1] px-2.5 py-0.5 text-xs font-semibold text-[#4A3026] dark:bg-[#322019] dark:text-[#EFE8E1]">
                  {meetings.length}
                </span>
              )}
            </div>
            <button
              onClick={fetchMeetings}
              disabled={isLoadingMeetings}
              className="rounded-lg p-1.5 text-[#7A625A] hover:bg-[#EFE8E1] hover:text-[#2A1B18] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#722F37] transition-all cursor-pointer dark:hover:bg-[#281A16] dark:text-[#BCAAA4]"
              title="Refresh meetings"
              aria-label="Refresh meetings"
            >
              <RotateCw className={`h-4 w-4 ${isLoadingMeetings ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {/* Loading State: Skeletons */}
        {isLoadingMeetings && (
          <div className="space-y-3">
            {[1, 2, 3].map((n) => (
              <div
                key={n}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-[#E5DDD5] bg-white p-4 dark:border-[#3E2D28] dark:bg-[#231815]"
              >
                <div className="space-y-2">
                  <Skeleton className="h-5 w-48 sm:w-80 bg-[#EFE8E1] dark:bg-[#2F211C]" />
                  <Skeleton className="h-4 w-32 bg-[#EFE8E1] dark:bg-[#2F211C]" />
                </div>
                <div className="flex items-center gap-3">
                  <Skeleton className="h-6 w-20 rounded-full bg-[#EFE8E1] dark:bg-[#2F211C]" />
                  <Skeleton className="h-8 w-24 rounded-lg bg-[#EFE8E1] dark:bg-[#2F211C]" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty State */}
        {!isLoadingMeetings && meetings.length === 0 && (
          <Card className="flex flex-col items-center justify-center border-dashed border-[#D7CCC8] py-14 text-center dark:border-[#4A3730]">
            <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#EFE8E1] text-[#7A625A] dark:bg-[#322019] dark:text-[#BCAAA4]">
              <FolderOpen className="h-6 w-6" />
            </span>
            <h3 className="text-base font-semibold text-[#2A1B18] dark:text-[#F5EFEB]">
              No meetings yet
            </h3>
            <p className="mt-1 max-w-sm text-sm text-[#7A625A] dark:text-[#BCAAA4]">
              Create a new meeting or load the sample sync above to generate your first AI meeting summary and action items.
            </p>
          </Card>
        )}

        {/* Meetings List */}
        {!isLoadingMeetings && meetings.length > 0 && (
          <div className="grid gap-3">
            {meetings.map((item) => {
              const isReady = item.status === "ready";
              const isLive = item.status === "live";

              const handleOpen = () => {
                if (isReady) {
                  router.push(`/summary/${encodeURIComponent(item.id)}`);
                } else if (isLive) {
                  router.push(`/meeting/${encodeURIComponent(item.code)}`);
                }
              };

              return (
                <div
                  key={item.id}
                  role={isReady || isLive ? "button" : undefined}
                  tabIndex={isReady || isLive ? 0 : undefined}
                  onClick={handleOpen}
                  onKeyDown={(e) => {
                    if ((e.key === "Enter" || e.key === " ") && (isReady || isLive)) {
                      e.preventDefault();
                      handleOpen();
                    }
                  }}
                  className={`group flex flex-col justify-between gap-4 rounded-xl border border-[#E5DDD5] bg-white p-4 shadow-sm transition-all sm:flex-row sm:items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#722F37] dark:border-[#3E2D28] dark:bg-[#231815] ${
                    isReady || isLive
                      ? "cursor-pointer hover:border-[#722F37] hover:shadow-md dark:hover:border-[#9C4B5D]"
                      : ""
                  }`}
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2.5">
                      <h4 className="text-base font-semibold text-[#2A1B18] group-hover:text-[#722F37] dark:text-[#F5EFEB] dark:group-hover:text-[#E8A2B0] transition-colors">
                        {item.title}
                      </h4>
                      <span className="font-mono text-xs text-[#5D3D2E] bg-[#EFE8E1] dark:text-[#EFE8E1] dark:bg-[#34221B] px-2 py-0.5 rounded">
                        {item.code}
                      </span>
                    </div>

                    <div className="flex items-center gap-4 text-xs text-[#7A625A] dark:text-[#BCAAA4]">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {formatDate(item.started_at)}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 sm:self-center">
                    {renderStatusBadge(item.status)}

                    {isReady && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/summary/${encodeURIComponent(item.id)}`);
                        }}
                        className="text-[#722F37] hover:bg-[#FAF0F2] hover:text-[#5A1827] dark:text-[#E8A2B0] dark:hover:bg-[#361A21]"
                      >
                        View Summary
                        <ArrowRight className="h-3.5 w-3.5 ml-1" />
                      </Button>
                    )}

                    {isLive && (
                      <Button
                        size="sm"
                        variant="default"
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/meeting/${encodeURIComponent(item.code)}`);
                        }}
                        className="bg-[#722F37] hover:bg-[#5A1827] text-white"
                      >
                        Rejoin
                        <ArrowRight className="h-3.5 w-3.5 ml-1" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
