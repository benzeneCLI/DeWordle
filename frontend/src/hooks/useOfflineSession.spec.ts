import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import {
  useOfflineSession,
  type OfflineSessionRecord,
  type UseOfflineSessionOptions,
} from "./useOfflineSession";

const STORAGE_KEY = "dewordle_offline_session:test";
const PENDING_KEY = `${STORAGE_KEY}:pending`;

function makeOptions(
  overrides: Partial<UseOfflineSessionOptions> = {},
): UseOfflineSessionOptions {
  return {
    storageKey: STORAGE_KEY,
    apiBase: "http://test.local",
    guestId: "guest-42",
    buildSyncResult: (session) => ({
      gameId: 1,
      score: session.guesses.length * 100,
      durationSeconds: 60,
    }),
    onSyncError: vi.fn(),
    ...overrides,
  };
}

describe("useOfflineSession", () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("starts with no active session", () => {
    const { result } = renderHook(() => useOfflineSession(makeOptions()));
    expect(result.current.session).toBeNull();
    expect(result.current.pendingSyncCount).toBe(0);
  });

  it("persists the active session to localStorage on every guess", () => {
    const { result } = renderHook(() => useOfflineSession(makeOptions()));
    act(() => {
      result.current.submitGuess("WORDS");
    });
    act(() => {
      result.current.submitGuess("CRANE");
    });
    expect(result.current.session?.guesses).toEqual(["WORDS", "CRANE"]);

    const stored = JSON.parse(
      window.localStorage.getItem(STORAGE_KEY) ?? "null",
    ) as OfflineSessionRecord;
    expect(stored.guesses).toEqual(["WORDS", "CRANE"]);
    expect(stored.status).toBe("active");
  });

  it("syncs a completed session to the guest endpoint when online and clears it", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ id: 1 }), { status: 201 }));
    const { result } = renderHook(() => useOfflineSession(makeOptions()));

    act(() => {
      result.current.submitGuess("WORDS");
    });
    await act(async () => {
      result.current.completeSession("win");
    });

    expect(result.current.pendingSyncCount).toBe(0);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = (global.fetch as ReturnType<typeof vi.fn>).mock
      .calls[0] as [string, RequestInit];
    expect(url).toBe("http://test.local/api/v1/sessions/guest");
    expect(JSON.parse(init.body as string)).toEqual({
      gameId: 1,
      score: 100,
      durationSeconds: 60,
      metadata: { guestId: "guest-42" },
    });
    expect(JSON.parse(window.localStorage.getItem(PENDING_KEY) ?? "[]")).toHaveLength(0);
  });

  it("holds completed results while offline, then syncs on the online event", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ id: 2 }), { status: 201 }));
    const { result } = renderHook(() => useOfflineSession(makeOptions()));

    act(() => {
      window.dispatchEvent(new Event("offline"));
    });
    expect(result.current.isOnline).toBe(false);

    act(() => {
      result.current.submitGuess("WORDS");
    });
    await act(async () => {
      result.current.completeSession("loss");
    });

    expect(global.fetch).not.toHaveBeenCalled();
    expect(JSON.parse(window.localStorage.getItem(PENDING_KEY) ?? "[]")).toHaveLength(1);

    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    expect(result.current.isOnline).toBe(true);
    await act(async () => {});

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(result.current.pendingSyncCount).toBe(0);
  });

  it("keeps the pending item and reports the error when syncing fails", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("network down"));
    const onSyncError = vi.fn();
    const { result } = renderHook(() =>
      useOfflineSession(makeOptions({ onSyncError })),
    );

    act(() => {
      result.current.submitGuess("WORDS");
    });
    await act(async () => {
      result.current.completeSession("win");
    });

    expect(onSyncError).toHaveBeenCalledTimes(1);
    expect(onSyncError.mock.calls[0][0]).toMatchObject({
      status: "completed",
      guesses: ["WORDS"],
    });
    expect(result.current.pendingSyncCount).toBe(1);
    expect(JSON.parse(window.localStorage.getItem(PENDING_KEY) ?? "[]")).toHaveLength(1);
  });

  it("resetSession clears the active session and its storage", () => {
    const { result } = renderHook(() => useOfflineSession(makeOptions()));
    act(() => {
      result.current.submitGuess("WORDS");
    });
    expect(result.current.session).not.toBeNull();

    act(() => {
      result.current.resetSession();
    });
    expect(result.current.session).toBeNull();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("null");
  });
});
