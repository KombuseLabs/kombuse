import { useEffect } from "react";

const SCROLL_ACTIVITY_CLASS_NAME = "is-scrolling";
const SCROLL_IDLE_TIMEOUT_MS = 700;

function resolveScrollElement(target: EventTarget | null): Element | null {
  if (target instanceof Element) {
    return target;
  }

  if (target instanceof Document) {
    return target.scrollingElement;
  }

  if (target === window) {
    return document.scrollingElement;
  }

  return null;
}

export function useScrollbarActivity() {
  useEffect(() => {
    const timeoutByElement = new Map<Element, number>();

    const clearScrollState = (element: Element) => {
      const timeoutId = timeoutByElement.get(element);
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }

      timeoutByElement.delete(element);
      element.classList.remove(SCROLL_ACTIVITY_CLASS_NAME);
    };

    const markActiveScrollElement = (event: Event) => {
      const element = resolveScrollElement(event.target);
      if (!element) {
        return;
      }

      element.classList.add(SCROLL_ACTIVITY_CLASS_NAME);
      const existingTimeoutId = timeoutByElement.get(element);
      if (existingTimeoutId !== undefined) {
        window.clearTimeout(existingTimeoutId);
      }

      const nextTimeoutId = window.setTimeout(() => {
        timeoutByElement.delete(element);
        element.classList.remove(SCROLL_ACTIVITY_CLASS_NAME);
      }, SCROLL_IDLE_TIMEOUT_MS);

      timeoutByElement.set(element, nextTimeoutId);
    };

    document.addEventListener("scroll", markActiveScrollElement, true);

    return () => {
      document.removeEventListener("scroll", markActiveScrollElement, true);

      for (const element of timeoutByElement.keys()) {
        clearScrollState(element);
      }
    };
  }, []);
}
