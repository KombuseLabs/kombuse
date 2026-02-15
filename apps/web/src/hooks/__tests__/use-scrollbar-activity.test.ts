import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useScrollbarActivity } from "../use-scrollbar-activity";

function appendScrollableElement() {
  const element = document.createElement("div");
  document.body.appendChild(element);
  return element;
}

describe("useScrollbarActivity", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  it("adds and removes .is-scrolling after inactivity", () => {
    renderHook(() => useScrollbarActivity());
    const element = appendScrollableElement();

    act(() => {
      element.dispatchEvent(new Event("scroll"));
    });

    expect(element.classList.contains("is-scrolling")).toBe(true);

    act(() => {
      vi.advanceTimersByTime(699);
    });

    expect(element.classList.contains("is-scrolling")).toBe(true);

    act(() => {
      vi.advanceTimersByTime(1);
    });

    expect(element.classList.contains("is-scrolling")).toBe(false);
  });

  it("resets the inactivity timeout when scroll activity continues", () => {
    renderHook(() => useScrollbarActivity());
    const element = appendScrollableElement();

    act(() => {
      element.dispatchEvent(new Event("scroll"));
      vi.advanceTimersByTime(500);
      element.dispatchEvent(new Event("scroll"));
    });

    act(() => {
      vi.advanceTimersByTime(699);
    });

    expect(element.classList.contains("is-scrolling")).toBe(true);

    act(() => {
      vi.advanceTimersByTime(1);
    });

    expect(element.classList.contains("is-scrolling")).toBe(false);
  });

  it("removes class state and listeners on unmount", () => {
    const { unmount } = renderHook(() => useScrollbarActivity());
    const element = appendScrollableElement();

    act(() => {
      element.dispatchEvent(new Event("scroll"));
    });

    expect(element.classList.contains("is-scrolling")).toBe(true);

    unmount();

    expect(element.classList.contains("is-scrolling")).toBe(false);

    act(() => {
      vi.runOnlyPendingTimers();
      element.dispatchEvent(new Event("scroll"));
    });

    expect(element.classList.contains("is-scrolling")).toBe(false);
  });
});
