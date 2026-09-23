import { useSyncExternalStore } from "react";

export type ToastTone = "info" | "success" | "error" | "warning";

export interface ToastItem {
  id: string;
  message: string;
  tone: ToastTone;
  durationMs: number;
  createdAt: number;
}

const DEFAULT_DURATION_MS = 2500;
const EMPTY_SNAPSHOT: readonly ToastItem[] = [];

let toastList: readonly ToastItem[] = [];
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): readonly ToastItem[] {
  return toastList;
}

function getServerSnapshot(): readonly ToastItem[] {
  return EMPTY_SNAPSHOT;
}

function deterministicId(message: string): string {
  let hash = 0;
  for (let i = 0; i < message.length; i += 1) {
    hash = (hash * 31 + message.charCodeAt(i)) | 0;
  }
  return `toast-${message.length}-${Math.abs(hash).toString(36)}`;
}

export function pushToast(
  message: string,
  options?: { tone?: ToastTone; durationMs?: number },
): string | null {
  const normalized = message.trim();
  if (!normalized) return null;
  if (toastList.some((toast) => toast.message === normalized)) return null;

  const item: ToastItem = {
    id: deterministicId(normalized),
    message: normalized,
    tone: options?.tone ?? "info",
    durationMs: options?.durationMs ?? DEFAULT_DURATION_MS,
    createdAt: Date.now(),
  };
  toastList = [...toastList, item];
  emit();
  if (item.durationMs > 0) {
    window.setTimeout(() => dismissToast(item.id), item.durationMs);
  }
  return item.id;
}

export function dismissToast(id: string): void {
  const next = toastList.filter((toast) => toast.id !== id);
  if (next.length === toastList.length) return;
  toastList = next;
  emit();
}

export function clearToasts(): void {
  if (toastList.length === 0) return;
  toastList = [];
  emit();
}

export function useToastStore(): readonly ToastItem[] {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
