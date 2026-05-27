import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RecordButton } from "./record-button";
import type { RecordingState } from "./use-two-second-recorder";

describe("RecordButton", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.useRealTimers();
  });

  function renderButton(state: RecordingState) {
    act(() => {
      root.render(<RecordButton state={state} progress={0} onClick={() => undefined} />);
    });
  }

  function activeMarker() {
    return container.querySelector('[data-record-marker-active="true"]');
  }

  it("pulses each second marker during a three second recording", () => {
    renderButton("recording");

    expect(activeMarker()).toBeNull();

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(activeMarker()).toHaveAttribute("data-record-marker", "1");

    act(() => {
      vi.advanceTimersByTime(420);
    });
    expect(activeMarker()).toBeNull();

    act(() => {
      vi.advanceTimersByTime(580);
    });
    expect(activeMarker()).toHaveAttribute("data-record-marker", "2");

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(activeMarker()).toHaveAttribute("data-record-marker", "3");
  });

  it("clears pending marker pulses when recording stops", () => {
    renderButton("recording");

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(activeMarker()).toHaveAttribute("data-record-marker", "1");

    renderButton("idle");
    expect(activeMarker()).toBeNull();

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(activeMarker()).toBeNull();
  });
});
