import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useHistoryNavigation } from "../use-history-navigation";

const mockNavigate = vi.fn();
let mockLocation = { pathname: "/", search: "", hash: "", state: null, key: "default" };

vi.mock("react-router-dom", () => ({
  useLocation: () => mockLocation,
  useNavigate: () => mockNavigate,
}));

function setLocation(pathname: string, search = "") {
  mockLocation = { pathname, search, hash: "", state: null, key: Math.random().toString() };
}

describe("useHistoryNavigation", () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    setLocation("/");
  });

  it("starts with canGoBack and canGoForward both false", () => {
    const { result } = renderHook(() => useHistoryNavigation());

    expect(result.current.canGoBack).toBe(false);
    expect(result.current.canGoForward).toBe(false);
  });

  it("enables canGoBack after navigating to a new path", () => {
    const { result, rerender } = renderHook(() => useHistoryNavigation());

    setLocation("/tickets");
    rerender();

    expect(result.current.canGoBack).toBe(true);
    expect(result.current.canGoForward).toBe(false);
  });

  it("navigates back and updates state", () => {
    const { result, rerender } = renderHook(() => useHistoryNavigation());

    setLocation("/tickets");
    rerender();

    act(() => {
      result.current.goBack();
    });

    expect(mockNavigate).toHaveBeenCalledWith("/");
    expect(result.current.canGoBack).toBe(false);
    expect(result.current.canGoForward).toBe(true);
  });

  it("navigates forward after going back", () => {
    const { result, rerender } = renderHook(() => useHistoryNavigation());

    setLocation("/tickets");
    rerender();

    act(() => {
      result.current.goBack();
    });

    // Simulate the location change from goBack (isInternalNavRef skips push)
    setLocation("/");
    rerender();

    act(() => {
      result.current.goForward();
    });

    expect(mockNavigate).toHaveBeenLastCalledWith("/tickets");
    expect(result.current.canGoBack).toBe(true);
    expect(result.current.canGoForward).toBe(false);
  });

  it("truncates forward history when navigating to a new path from mid-stack", () => {
    const { result, rerender } = renderHook(() => useHistoryNavigation());

    // Build stack: / → /tickets → /chats
    setLocation("/tickets");
    rerender();
    setLocation("/chats");
    rerender();

    // Go back to /tickets
    act(() => {
      result.current.goBack();
    });
    setLocation("/tickets");
    rerender();

    // Navigate to a new path — should truncate /chats from forward stack
    setLocation("/agents");
    rerender();

    expect(result.current.canGoBack).toBe(true);
    expect(result.current.canGoForward).toBe(false);
  });

  it("does not add duplicate entry when re-rendered with the same location", () => {
    const { result, rerender } = renderHook(() => useHistoryNavigation());

    setLocation("/tickets");
    rerender();

    // Re-render with the same location
    rerender();

    expect(result.current.canGoBack).toBe(true);
    expect(result.current.canGoForward).toBe(false);

    // Going back should land on / (only one /tickets entry)
    act(() => {
      result.current.goBack();
    });

    expect(mockNavigate).toHaveBeenCalledWith("/");
    expect(result.current.canGoBack).toBe(false);
  });

  it("skips push when location changes from internal navigation (isInternalNavRef)", () => {
    const { result, rerender } = renderHook(() => useHistoryNavigation());

    setLocation("/tickets");
    rerender();

    act(() => {
      result.current.goBack();
    });

    // Simulate location update from goBack — should be skipped via isInternalNavRef
    setLocation("/");
    rerender();

    // canGoForward should still be true (the / entry wasn't re-pushed)
    expect(result.current.canGoForward).toBe(true);
    expect(result.current.canGoBack).toBe(false);
  });

  it("goBack is a no-op when already at the start", () => {
    const { result } = renderHook(() => useHistoryNavigation());

    act(() => {
      result.current.goBack();
    });

    expect(mockNavigate).not.toHaveBeenCalled();
    expect(result.current.canGoBack).toBe(false);
    expect(result.current.canGoForward).toBe(false);
  });

  it("goForward is a no-op when already at the end", () => {
    const { result, rerender } = renderHook(() => useHistoryNavigation());

    setLocation("/tickets");
    rerender();

    act(() => {
      result.current.goForward();
    });

    expect(mockNavigate).not.toHaveBeenCalled();
    expect(result.current.canGoBack).toBe(true);
    expect(result.current.canGoForward).toBe(false);
  });

  it("handles search params in the path", () => {
    const { result, rerender } = renderHook(() => useHistoryNavigation());

    setLocation("/tickets", "?status=open");
    rerender();

    expect(result.current.canGoBack).toBe(true);

    act(() => {
      result.current.goBack();
    });

    expect(mockNavigate).toHaveBeenCalledWith("/");
  });
});
