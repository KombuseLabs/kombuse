import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

export interface HistoryNavigationState {
  canGoBack: boolean;
  canGoForward: boolean;
  goBack: () => void;
  goForward: () => void;
}

const defaultState: HistoryNavigationState = {
  canGoBack: false,
  canGoForward: false,
  goBack: () => {},
  goForward: () => {},
};

export const HistoryNavigationContext =
  createContext<HistoryNavigationState>(defaultState);

export function useHistoryNavigationContext(): HistoryNavigationState {
  return useContext(HistoryNavigationContext);
}

export function useHistoryNavigation(): HistoryNavigationState {
  const location = useLocation();
  const navigate = useNavigate();

  const fullPath = location.pathname + location.search;

  const entriesRef = useRef<string[]>([fullPath]);
  const cursorRef = useRef<number>(0);
  const isInternalNavRef = useRef(false);

  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);

  const syncCan = useCallback(() => {
    setCanGoBack(cursorRef.current > 0);
    setCanGoForward(cursorRef.current < entriesRef.current.length - 1);
  }, []);

  useEffect(() => {
    const current = location.pathname + location.search;

    if (isInternalNavRef.current) {
      isInternalNavRef.current = false;
      return;
    }

    const entries = entriesRef.current;
    const cursor = cursorRef.current;

    if (entries[cursor] === current) {
      return;
    }

    const newEntries = entries.slice(0, cursor + 1);
    newEntries.push(current);
    entriesRef.current = newEntries;
    cursorRef.current = newEntries.length - 1;

    syncCan();
  }, [fullPath, syncCan]);

  const goBack = useCallback(() => {
    if (cursorRef.current <= 0) return;
    isInternalNavRef.current = true;
    cursorRef.current -= 1;
    const target = entriesRef.current[cursorRef.current];
    syncCan();
    navigate(target);
  }, [navigate, syncCan]);

  const goForward = useCallback(() => {
    if (cursorRef.current >= entriesRef.current.length - 1) return;
    isInternalNavRef.current = true;
    cursorRef.current += 1;
    const target = entriesRef.current[cursorRef.current];
    syncCan();
    navigate(target);
  }, [navigate, syncCan]);

  return { canGoBack, canGoForward, goBack, goForward };
}
