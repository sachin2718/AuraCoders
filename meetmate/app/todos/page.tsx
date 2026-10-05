"use client";

import * as React from "react";
import {
  Check,
  Calendar,
  AlertCircle,
  Video,
  ListTodo,
  CheckCircle2,
  Clock,
  RotateCw,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { TodoItem, ActionStatus, Priority } from "@/lib/types";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast, Toaster } from "@/components/ui/toast";

export default function MyTodosPage() {
  const [todos, setTodos] = React.useState<TodoItem[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [activeTab, setActiveTab] = React.useState<ActionStatus>("todo");
  const [updatingIds, setUpdatingIds] = React.useState<Set<string>>(new Set());

  // ── Timestamp Formatter: milliseconds -> mm:ss ──────────────────────
  const formatTimestamp = (tMs?: number | null): string => {
    if (tMs == null || isNaN(tMs)) return "00:00";
    const totalSeconds = Math.max(0, Math.floor(tMs / 1000));
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // ── Date Formatter ──────────────────────────────────────────────────
  const formatDueDate = (dueDate?: string | null): string => {
    if (!dueDate) return "No due date";
    try {
      const d = new Date(dueDate + "T00:00:00");
      return d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return dueDate;
    }
  };

  // ── Overdue Checker ─────────────────────────────────────────────────
  const isOverdue = (dueDate?: string | null, status?: ActionStatus): boolean => {
    if (!dueDate || status === "done") return false;
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const due = new Date(dueDate + "T00:00:00");
      return due < today;
    } catch {
      return false;
    }
  };

  // ── Fetch Todos (API already filters for signed-in user) ───────────
  const loadTodos = React.useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await api.getMyTodos();
      setTodos(data);
    } catch (err: unknown) {
      const message =
        err instanceof ApiError ? err.message : "Failed to load to-dos";
      toast({
        title: "Error Loading To-Dos",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    document.title = "My To-Dos | MeetMate";
    loadTodos();
  }, [loadTodos]);

  // ── Optimistic Checkbox Toggle with Rollback ────────────────────────
  const handleToggleTodo = async (item: TodoItem) => {
    const previousStatus = item.status;
    const nextStatus: ActionStatus = previousStatus === "todo" ? "done" : "todo";

    // 1. Optimistic Update in State
    setTodos((prev) =>
      prev.map((t) => (t.id === item.id ? { ...t, status: nextStatus } : t))
    );

    // Track in-flight state
    setUpdatingIds((prev) => new Set(prev).add(item.id));

    try {
      // 2. Call API
      await api.updateTodo(item.id, nextStatus);
    } catch (err: unknown) {
      // 3. Rollback on Error
      setTodos((prev) =>
        prev.map((t) =>
          t.id === item.id ? { ...t, status: previousStatus } : t
        )
      );

      const msg =
        err instanceof ApiError ? err.message : "Failed to update item status";
      toast({
        title: "Update Failed",
        description: `${msg}. Rolled back changes.`,
        variant: "destructive",
      });
    } finally {
      setUpdatingIds((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    }
  };

  // ── Priority Badge Helper ───────────────────────────────────────────
  const renderPriorityBadge = (priority: Priority) => {
    switch (priority) {
      case "high":
        return (
          <Badge
            variant="outline"
            className="border-[#722F37]/30 bg-[#FAF0F2] text-[#722F37] dark:bg-[#341B21] dark:text-[#E8A2B0] text-[11px] font-semibold"
          >
            High
          </Badge>
        );
      case "medium":
        return (
          <Badge
            variant="outline"
            className="border-[#8C5824]/30 bg-[#FAF2E6] text-[#8C5824] dark:bg-[#342414] dark:text-[#DEAC78] text-[11px] font-semibold"
          >
            Medium
          </Badge>
        );
      case "low":
        return (
          <Badge
            variant="outline"
            className="border-[#4A3026]/20 bg-[#EFE8E1] text-[#4A3026] dark:bg-[#2C1D18] dark:text-[#C5B3AC] text-[11px] font-semibold"
          >
            Low
          </Badge>
        );
      default:
        return <Badge variant="secondary">{priority}</Badge>;
    }
  };

  // ── Filter by Active Tab & Group by Meeting Title ───────────────────
  const filteredTodos = todos.filter((t) => t.status === activeTab);

  const groupedByMeeting = filteredTodos.reduce(
    (acc, item) => {
      const title = item.meeting_title || "General Meetings";
      if (!acc[title]) acc[title] = [];
      acc[title].push(item);
      return acc;
    },
    {} as Record<string, TodoItem[]>
  );

  const meetingTitles = Object.keys(groupedByMeeting);

  // Tab counts
  const todoCount = todos.filter((t) => t.status === "todo").length;
  const doneCount = todos.filter((t) => t.status === "done").length;

  return (
    <div className="space-y-8 pb-16">
      <Toaster />

      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-[#2A1B18] dark:text-[#F5EFEB]">
            My To-Dos
          </h1>
          <p className="text-sm text-[#7A625A] dark:text-[#BCAAA4]">
            Action items assigned to you across all meetings with verified transcript quotes.
          </p>
        </div>

        {/* Tab Selector */}
        <div className="flex items-center rounded-lg border border-[#E5DDD5] bg-[#EFE8E1] p-1 dark:border-[#3E2D28] dark:bg-[#201512]">
          <button
            onClick={() => setActiveTab("todo")}
            className={`flex items-center gap-2 rounded-md px-3.5 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
              activeTab === "todo"
                ? "bg-[#722F37] text-white shadow-sm"
                : "text-[#5D443B] hover:text-[#2A1B18] dark:text-[#B8A49C] dark:hover:text-white"
            }`}
          >
            <ListTodo className="h-3.5 w-3.5" />
            <span>To do</span>
            <span
              className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                activeTab === "todo"
                  ? "bg-white/20 text-white"
                  : "bg-[#D7CCC8] text-[#4A3026] dark:bg-[#34221B] dark:text-[#EFE8E1]"
              }`}
            >
              {todoCount}
            </span>
          </button>

          <button
            onClick={() => setActiveTab("done")}
            className={`flex items-center gap-2 rounded-md px-3.5 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
              activeTab === "done"
                ? "bg-[#722F37] text-white shadow-sm"
                : "text-[#5D443B] hover:text-[#2A1B18] dark:text-[#B8A49C] dark:hover:text-white"
            }`}
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>Done</span>
            <span
              className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                activeTab === "done"
                  ? "bg-white/20 text-white"
                  : "bg-[#D7CCC8] text-[#4A3026] dark:bg-[#34221B] dark:text-[#EFE8E1]"
              }`}
            >
              {doneCount}
            </span>
          </button>
        </div>
      </div>

      {/* Skeletons while loading */}
      {isLoading && (
        <div className="space-y-6">
          {[1, 2].map((group) => (
            <Card
              key={group}
              className="border border-[#E5DDD5] bg-white p-6 dark:border-[#3E2D28] dark:bg-[#231815]"
            >
              <div className="mb-4 flex items-center gap-2">
                <Skeleton className="h-5 w-48 bg-[#EFE8E1] dark:bg-[#2F211C]" />
                <Skeleton className="h-5 w-12 rounded-full bg-[#EFE8E1] dark:bg-[#2F211C]" />
              </div>
              <div className="space-y-3">
                <Skeleton className="h-14 w-full rounded-lg bg-[#EFE8E1] dark:bg-[#2F211C]" />
                <Skeleton className="h-14 w-full rounded-lg bg-[#EFE8E1] dark:bg-[#2F211C]" />
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Empty State: Illustration-free Friendly Message */}
      {!isLoading && filteredTodos.length === 0 && (
        <Card className="border border-dashed border-[#D7CCC8] bg-white py-16 text-center dark:border-[#4A3730] dark:bg-[#231815]">
          <div className="mx-auto max-w-md px-6">
            <h3 className="text-lg font-bold text-[#2A1B18] dark:text-[#F5EFEB]">
              {activeTab === "todo" ? "All caught up!" : "No completed tasks yet"}
            </h3>
            <p className="mt-2 text-sm text-[#7A625A] dark:text-[#BCAAA4]">
              {activeTab === "todo"
                ? "You have zero pending action items. Tasks extracted by MeetMate during your meetings will appear here automatically."
                : "When you complete action items in the To do tab and check them off, they will be archived here."}
            </p>
          </div>
        </Card>
      )}

      {/* Grouped Todos by Meeting Title */}
      {!isLoading && filteredTodos.length > 0 && (
        <div className="space-y-6">
          {meetingTitles.map((title) => {
            const items = groupedByMeeting[title];

            return (
              <Card
                key={title}
                className="overflow-hidden border border-[#E5DDD5] bg-white shadow-sm dark:border-[#3E2D28] dark:bg-[#231815]"
              >
                {/* Meeting Group Header */}
                <CardHeader className="border-b border-[#F0EAE3] bg-[#FAF8F5] py-3.5 px-4 sm:px-6 dark:border-[#33221B] dark:bg-[#1E1410]">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#EFE8E1] text-[#722F37] dark:bg-[#322019] dark:text-[#E8A2B0]">
                        <Video className="h-4 w-4" />
                      </span>
                      <CardTitle className="text-base font-semibold text-[#2A1B18] dark:text-[#F5EFEB]">
                        {title}
                      </CardTitle>
                    </div>

                    <span className="rounded-full bg-[#EFE8E1] px-2.5 py-0.5 text-xs font-semibold text-[#4A3026] dark:bg-[#2F211C] dark:text-[#EFE8E1]">
                      {items.length} {items.length === 1 ? "item" : "items"}
                    </span>
                  </div>
                </CardHeader>

                {/* Items List */}
                <CardContent className="p-0 divide-y divide-[#F0EAE3] dark:divide-[#33221B]">
                  {items.map((item) => {
                    const isDone = item.status === "done";
                    const overdue = isOverdue(item.due_date, item.status);
                    const isUpdating = updatingIds.has(item.id);

                    return (
                      <div
                        key={item.id}
                        className={`flex items-start gap-3.5 p-4 sm:p-5 transition-colors ${
                          isDone
                            ? "bg-[#FAF8F5]/60 opacity-80 dark:bg-[#1A120E]/40"
                            : "hover:bg-[#FAF8F5] dark:hover:bg-[#1C1310]"
                        }`}
                      >
                        {/* Custom Accessible Checkbox */}
                        <button
                          type="button"
                          role="checkbox"
                          aria-checked={isDone}
                          disabled={isUpdating}
                          onClick={() => handleToggleTodo(item)}
                          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#722F37] focus:ring-offset-2 dark:focus:ring-offset-[#231815] ${
                            isDone
                              ? "border-[#722F37] bg-[#722F37] text-white shadow-none"
                              : "border-[#BCAAA4] bg-white hover:border-[#722F37] dark:border-[#523B33] dark:bg-[#1A120E]"
                          }`}
                        >
                          {isUpdating ? (
                            <RotateCw className="h-3 w-3 animate-spin text-[#722F37]" />
                          ) : (
                            isDone && <Check className="h-3.5 w-3.5 stroke-[3]" />
                          )}
                        </button>

                        {/* Item Details */}
                        <div className="flex-1 space-y-1.5 min-w-0">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <h4
                              className={`text-sm font-semibold tracking-tight ${
                                isDone
                                  ? "line-through text-[#8D766E] dark:text-[#786158]"
                                  : "text-[#2A1B18] dark:text-[#F5EFEB]"
                              }`}
                            >
                              {item.title}
                            </h4>

                            <div className="flex items-center gap-2 shrink-0">
                              {/* Due Date (Red if Overdue) */}
                              {item.due_date && (
                                <span
                                  className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold ${
                                    overdue
                                      ? "border border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300"
                                      : "border border-[#E5DDD5] bg-[#FAF8F5] text-[#7A625A] dark:border-[#3E2D28] dark:bg-[#1A120E] dark:text-[#BCAAA4]"
                                  }`}
                                >
                                  {overdue ? (
                                    <AlertCircle className="h-3 w-3 text-rose-600 dark:text-rose-400" />
                                  ) : (
                                    <Calendar className="h-3 w-3" />
                                  )}
                                  <span>
                                    {formatDueDate(item.due_date)}
                                    {overdue && " (Overdue)"}
                                  </span>
                                </span>
                              )}

                              {/* Priority Badge */}
                              {renderPriorityBadge(item.priority)}
                            </div>
                          </div>

                          {/* Source quote in a muted line: “…” at mm:ss */}
                          {item.source_quote && (
                            <p className="text-xs text-[#7A625A] dark:text-[#BCAAA4] italic leading-relaxed">
                              &ldquo;{item.source_quote}&rdquo;{" "}
                              <span className="not-italic font-mono text-[11px] font-semibold text-[#8C5824] dark:text-[#DEAC78]">
                                at {formatTimestamp(item.t_ms)}
                              </span>
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
