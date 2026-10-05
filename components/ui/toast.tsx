"use client";

import * as React from "react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ToastItem {
  id: string;
  title?: string;
  description?: string;
  variant?: "default" | "destructive" | "success";
}

type ToastListener = (toasts: ToastItem[]) => void;

let toastsState: ToastItem[] = [];
const listeners = new Set<ToastListener>();

function notify() {
  listeners.forEach((listener) => listener([...toastsState]));
}

export function toast({
  title,
  description,
  variant = "default",
}: Omit<ToastItem, "id">) {
  const id = Math.random().toString(36).substring(2, 9);
  const newToast: ToastItem = { id, title, description, variant };
  toastsState = [...toastsState, newToast];
  notify();

  setTimeout(() => {
    toastsState = toastsState.filter((t) => t.id !== id);
    notify();
  }, 4500);

  return id;
}

export function dismissToast(id: string) {
  toastsState = toastsState.filter((t) => t.id !== id);
  notify();
}

export function useToast() {
  const [toasts, setToasts] = React.useState<ToastItem[]>(toastsState);

  React.useEffect(() => {
    listeners.add(setToasts);
    return () => {
      listeners.delete(setToasts);
    };
  }, []);

  return { toasts, toast, dismiss: dismissToast };
}

export function Toaster() {
  const { toasts, dismiss } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex max-w-md flex-col gap-2.5">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            "pointer-events-auto flex items-start gap-3 rounded-xl border p-4 shadow-md transition-all animate-in fade-in slide-in-from-bottom-2",
            t.variant === "destructive"
              ? "border-[#8A2525]/30 bg-[#FDF0F0] text-[#7A1D1D] dark:border-[#8A2525]/50 dark:bg-[#341818] dark:text-[#FAD6D6]"
              : t.variant === "success"
              ? "border-[#722F37]/30 bg-[#FAF0F2] text-[#722F37] dark:border-[#722F37]/50 dark:bg-[#361A21] dark:text-[#F3CBD4]"
              : "border-[#D7CCC8] bg-white text-[#2A1B18] dark:border-[#4A3730] dark:bg-[#201512] dark:text-[#F5EFEB]"
          )}
        >
          {t.variant === "destructive" && (
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-[#8A2525] dark:text-[#E69393]" />
          )}
          {t.variant === "success" && (
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#722F37] dark:text-[#E8A2B0]" />
          )}
          {(!t.variant || t.variant === "default") && (
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-[#7A4B3A] dark:text-[#D4A392]" />
          )}

          <div className="flex-1">
            {t.title && <div className="text-sm font-semibold">{t.title}</div>}
            {t.description && (
              <div className="mt-0.5 text-xs opacity-90">{t.description}</div>
            )}
          </div>

          <button
            onClick={() => dismiss(t.id)}
            className="rounded-md p-1 opacity-70 hover:opacity-100 cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
