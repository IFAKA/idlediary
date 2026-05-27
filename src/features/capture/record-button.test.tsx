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

  function activeMarkerFor(second: number) {
    return container.querySelector(`[data-record-marker="${second}"][data-record-marker-active="true"]`);
  }

  function activeSegmentPulse() {
    return container.querySelector('[data-record-segment-pulse-active="true"]');
  }

  function activeSegmentPulseFor(second: number) {
    return container.querySelector(
      `[data-record-segment-pulse="${second}"][data-record-segment-pulse-active="true"]`,
    );
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
    expect(activeMarkerFor(1)).not.toBeNull();
    expect(activeSegmentPulseFor(1)).not.toBeNull();
    expect(activeSegmentPulseFor(1)).toHaveAttribute(
      "stroke-dasharray",
      recordSegments()[0]?.getAttribute("stroke-dasharray"),
    );
    expect(activeSegmentPulseFor(1)).toHaveAttribute(
      "stroke-dashoffset",
      recordSegments()[0]?.getAttribute("stroke-dashoffset"),
    );

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(activeMarkerFor(1)).not.toBeNull();
    expect(activeMarkerFor(2)).not.toBeNull();
    expect(activeSegmentPulseFor(1)).not.toBeNull();
    expect(activeSegmentPulseFor(2)).not.toBeNull();

    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(activeMarkerFor(1)).toBeNull();
    expect(activeMarkerFor(2)).not.toBeNull();
    expect(activeSegmentPulseFor(1)).toBeNull();
    expect(activeSegmentPulseFor(2)).not.toBeNull();

    act(() => {
      vi.advanceTimersByTime(850);
    });
    expect(activeMarkerFor(2)).not.toBeNull();
    expect(activeMarkerFor(3)).not.toBeNull();
    expect(activeSegmentPulseFor(2)).not.toBeNull();
    expect(activeSegmentPulseFor(3)).not.toBeNull();
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
