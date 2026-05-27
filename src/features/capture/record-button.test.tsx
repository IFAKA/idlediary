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

  function renderButton(state: RecordingState, progress = 0) {
    act(() => {
      root.render(<RecordButton state={state} progress={progress} onClick={() => undefined} />);
    });
  }

  function activeMarker() {
    return container.querySelector('[data-record-marker-active="true"]');
  }

  function activeSegmentPulse() {
    return container.querySelector('[data-record-segment-pulse-active="true"]');
  }

  function recordSegments() {
    return container.querySelectorAll("[data-record-segment]");
  }

  function progressSegments() {
    return container.querySelectorAll("[data-record-progress-segment]");
  }

  function recordRing() {
    return container.querySelector("[data-record-ring-hidden]");
  }

  it("renders three ring segments while recording", () => {
    renderButton("recording");

    expect(recordSegments()).toHaveLength(3);
  });

  it("uses the same segment geometry after recording completes", () => {
    renderButton("success", 100);

    const baseSegments = Array.from(recordSegments());
    const finishedSegments = Array.from(progressSegments());

    expect(finishedSegments).toHaveLength(3);
    for (const [index, finishedSegment] of finishedSegments.entries()) {
      expect(finishedSegment).toHaveAttribute(
        "stroke-dashoffset",
        baseSegments[index]?.getAttribute("stroke-dashoffset"),
      );
    }
  });

  it("fades out the whole ring after recording completes", () => {
    renderButton("success", 100);

    expect(recordRing()).toHaveAttribute("data-record-ring-hidden", "true");
  });

  it("pulses each second marker during a three second recording", () => {
    renderButton("recording");

    expect(activeMarker()).toBeNull();

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(activeMarker()).toHaveAttribute("data-record-marker", "1");
    expect(activeSegmentPulse()).toHaveAttribute("data-record-segment-pulse", "1");

    act(() => {
      vi.advanceTimersByTime(640);
    });
    expect(activeMarker()).toBeNull();
    expect(activeSegmentPulse()).toBeNull();

    act(() => {
      vi.advanceTimersByTime(580);
    });
    expect(activeMarker()).toHaveAttribute("data-record-marker", "2");
    expect(activeSegmentPulse()).toHaveAttribute("data-record-segment-pulse", "2");

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(activeMarker()).toHaveAttribute("data-record-marker", "3");
    expect(activeSegmentPulse()).toHaveAttribute("data-record-segment-pulse", "3");
  });

  it("clears pending marker pulses when recording stops", () => {
    renderButton("recording");

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(activeMarker()).toHaveAttribute("data-record-marker", "1");
    expect(activeSegmentPulse()).toHaveAttribute("data-record-segment-pulse", "1");

    renderButton("idle");
    expect(activeMarker()).toBeNull();
    expect(activeSegmentPulse()).toBeNull();

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(activeMarker()).toBeNull();
    expect(activeSegmentPulse()).toBeNull();
  });
});
