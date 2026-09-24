import { useCallback, useEffect, useRef, useState } from "react";

const DEFAULT_STORAGE_KEY = "dewordle_offline_session";
const DEFAULT_API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export type OfflineSessionStatus = "active" | "completed";

export interface OfflineSessionRecord {
  sessionId: string;
  guesses: string[];
  status: OfflineSessionStatus;
  outcome?: "win" | "loss";
  startedAt: string;
  finishedAt?: string;
}

export interface OfflineSyncResult {
  gameId: number;
  score: number;
  durationSeconds: number;
  metadata?: { guestId?: string; [key: string]: string | undefined };
}

export interface PendingSync {
  sessionId: string;
  record: OfflineSessionRecord;
  result: OfflineSyncResult;
}

export interface UseOfflineSessionOptions {
  storageKey?: string;
  apiBase?: string;
  guestId?: string;
  syncEndpoint?: string;
  syncHeaders?: Record<string, string>;
  buildSyncResult: (session: OfflineSessionRecord) => OfflineSyncResult;
  onSyncError?: (session: OfflineSessionRecord, error: unknown) => void;
}

export interface UseOfflineSessionReturn {
  isOnline: boolean;
  session: OfflineSessionRecord | null;
  pendingSyncCount: number;
  submitGuess: (guess: string) => void;
  completeSession: (outcome: "win" | "loss") => void;
  resetSession: () => void;
  flushPendingSyncs: () => Promise<void>;
}

function readStored<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeStored(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage unavailable (private mode, quota, or SSR)
  }
}

function makeSessionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `session_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function createSession(): OfflineSessionRecord {
  return {
    sessionId: makeSessionId(),
    guesses: [],
    status: "active",
    startedAt: new Date().toISOString(),
  };
}

/**
 * Tracks an active word-guessing session locally so a player can keep playing
 * offline, then syncs completed results to the backend once the browser
 * regains connectivity (`online`/`offline` events).
 */
export function useOfflineSession(
  options: UseOfflineSessionOptions,
): UseOfflineSessionReturn {
  const {
    storageKey = DEFAULT_STORAGE_KEY,
    apiBase = DEFAULT_API_BASE,
    guestId,
    syncEndpoint,
    syncHeaders,
    buildSyncResult,
    onSyncError,
  } = options;

  const pendingKey = `${storageKey}:pending`;

  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );
  const [session, setSession] = useState<OfflineSessionRecord | null>(() =>
    readStored<OfflineSessionRecord | null>(storageKey, null),
  );
  const [pendingSyncCount, setPendingSyncCount] = useState(
    () => readStored<PendingSync[]>(pendingKey, []).length,
  );

  const isOnlineRef = useRef(isOnline);
  const enqueuedSessionIdRef = useRef<string | null>(null);
  const buildSyncResultRef = useRef(buildSyncResult);
  const onSyncErrorRef = useRef(onSyncError);
  buildSyncResultRef.current = buildSyncResult;
  onSyncErrorRef.current = onSyncError;

  useEffect(() => {
    isOnlineRef.current = isOnline;
  }, [isOnline]);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    if (session) writeStored(storageKey, session);
  }, [session, storageKey]);

  const flushPendingSyncs = useCallback(async (): Promise<void> => {
    if (!isOnlineRef.current) return;
    const pending = readStored<PendingSync[]>(pendingKey, []);
    if (pending.length === 0) return;

    const endpoint = syncEndpoint ?? `${apiBase}/api/v1/sessions/guest`;
    for (const item of pending) {
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...syncHeaders,
          },
          body: JSON.stringify(item.result),
        });
        if (!res.ok) throw new Error(`Sync failed with status ${res.status}`);
        const remaining = readStored<PendingSync[]>(pendingKey, []).filter(
          (queued) => queued.sessionId !== item.sessionId,
        );
        writeStored(pendingKey, remaining);
        setPendingSyncCount(remaining.length);
      } catch (error) {
        onSyncErrorRef.current?.(item.record, error);
        return;
      }
    }
  }, [apiBase, pendingKey, syncEndpoint, syncHeaders]);

  useEffect(() => {
    if (!isOnline) return;
    void flushPendingSyncs();
  }, [isOnline, flushPendingSyncs]);

  useEffect(() => {
    if (!session || session.status !== "completed") return;
    if (enqueuedSessionIdRef.current === session.sessionId) return;
    enqueuedSessionIdRef.current = session.sessionId;

    const result = buildSyncResultRef.current(session);
    const metadata: OfflineSyncResult["metadata"] = result.metadata
      ? { ...result.metadata }
      : {};
    if (guestId) metadata.guestId = guestId;
    const item: PendingSync = {
      sessionId: session.sessionId,
      record: session,
      result: { ...result, metadata },
    };
    const pending = readStored<PendingSync[]>(pendingKey, []);
    writeStored(pendingKey, [...pending, item]);
    setPendingSyncCount((count) => count + 1);
    if (isOnlineRef.current) void flushPendingSyncs();
  }, [session, pendingKey, guestId, flushPendingSyncs]);

  const submitGuess = useCallback((guess: string) => {
    setSession((prev) => {
      const base = prev ?? createSession();
      return { ...base, guesses: [...base.guesses, guess] };
    });
  }, []);

  const completeSession = useCallback((outcome: "win" | "loss") => {
    setSession((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        status: "completed",
        outcome,
        finishedAt: new Date().toISOString(),
      };
    });
  }, []);

  const resetSession = useCallback(() => {
    enqueuedSessionIdRef.current = null;
    setSession(null);
    writeStored(storageKey, null);
  }, [storageKey]);

  return {
    isOnline,
    session,
    pendingSyncCount,
    submitGuess,
    completeSession,
    resetSession,
    flushPendingSyncs,
  };
}
