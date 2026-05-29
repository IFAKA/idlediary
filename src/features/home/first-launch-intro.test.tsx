import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FirstLaunchIntro } from "./first-launch-intro";

function mockReducedMotion(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn((query: string) => ({
      addEventListener: vi.fn(),
      addListener: vi.fn(),
      dispatchEvent: vi.fn(),
      matches: query === "(prefers-reduced-motion: reduce)" ? matches : false,
      media: query,
      onchange: null,
      removeEventListener: vi.fn(),
      removeListener: vi.fn(),
    })),
  });
}

describe("FirstLaunchIntro", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    mockReducedMotion(false);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.restoreAllMocks();
  });

  function renderIntro() {
    act(() => {
      root.render(<FirstLaunchIntro onStart={() => undefined} />);
    });
  }

  function tapIconAt(times: number[]) {
    const icon = container.querySelector<HTMLButtonElement>('button[aria-label="Nudge app icon"]');
    expect(icon).not.toBeNull();

    const nowSpy = vi.spyOn(performance, "now");
    for (const time of times) {
      nowSpy.mockReturnValue(time);
      act(() => {
        icon?.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: 12, clientY: 12 }));
      });
    }
  }

  it("shows a tear after two fast icon taps", () => {
    renderIntro();

    tapIconAt([0, 420]);

    expect(container.querySelector('[data-testid="intro-logo-tear"]')).toBeInTheDocument();
  });

  it("does not show a tear for slow icon taps", () => {
    renderIntro();

    tapIconAt([0, 900, 1800]);

    expect(container.querySelector('[data-testid="intro-logo-tear"]')).not.toBeInTheDocument();
  });

  it("skips the tear when reduced motion is enabled", () => {
    mockReducedMotion(true);
    renderIntro();

    tapIconAt([0, 420]);

    expect(container.querySelector('[data-testid="intro-logo-tear"]')).not.toBeInTheDocument();
  });
});
