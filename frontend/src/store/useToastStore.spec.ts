import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import {
  clearToasts,
  dismissToast,
  pushToast,
  useToastStore,
} from "./useToastStore";

describe("useToastStore", () => {
  beforeEach(() => {
    clearToasts();
  });

  afterEach(() => {
    vi.useRealTimers();
    clearToasts();
  });

  it("starts with an empty toast queue", () => {
    const { result } = renderHook(() => useToastStore());
    expect(result.current).toHaveLength(0);
  });

  it("pushes a toast and returns a deterministic message key id", () => {
    const first = pushToast("Word not long enough");
    const second = pushToast("Word not long enough");
    expect(second).toBeNull();
    expect(first).toMatch(/^toast-/);

    const { result } = renderHook(() => useToastStore());
    expect(result.current).toHaveLength(1);
    expect(result.current[0]).toMatchObject({
      id: first,
      message: "Word not long enough",
      tone: "info",
      durationMs: 2500,
    });
  });

  it("ignores new triggers whose message is already queued", () => {
    pushToast("Word not long enough");
    pushToast("Word not long enough", { tone: "warning" });
    const { result } = renderHook(() => useToastStore());
    expect(result.current).toHaveLength(1);
  });

  it("trims and rejects blank messages", () => {
    expect(pushToast("   ")).toBeNull();
    expect(pushToast("")).toBeNull();
    const { result } = renderHook(() => useToastStore());
    expect(result.current).toHaveLength(0);
  });

  it("auto-dismisses a toast after 2500ms", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useToastStore());
    act(() => {
      pushToast("Auto dismissed", { durationMs: 2500 });
    });
    expect(result.current).toHaveLength(1);

    act(() => {
      vi.advanceTimersByTime(2500);
    });
    expect(result.current).toHaveLength(0);
  });

  it("does not auto-dismiss when durationMs is zero", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useToastStore());
    act(() => {
      pushToast("Sticky toast", { durationMs: 0 });
    });
    act(() => {
      vi.advanceTimersByTime(10000);
    });
    expect(result.current).toHaveLength(1);
  });

  it("dismissToast removes only the targeted toast", () => {
    const a = pushToast("First", { durationMs: 0 });
    pushToast("Second", { durationMs: 0 });
    expect(a).not.toBeNull();
    const { result } = renderHook(() => useToastStore());
    act(() => {
      dismissToast(a as string);
    });
    expect(result.current).toHaveLength(1);
    expect(result.current[0].message).toBe("Second");
  });

  it("clearToasts empties the queue", () => {
    pushToast("A", { durationMs: 0 });
    pushToast("B", { durationMs: 0 });
    const { result } = renderHook(() => useToastStore());
    act(() => {
      clearToasts();
    });
    expect(result.current).toHaveLength(0);
  });
});
