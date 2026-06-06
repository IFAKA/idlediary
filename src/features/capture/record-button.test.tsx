import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RecordButton } from "./record-button";
import type { RecordingState } from "./use-two-second-recorder";

describe("RecordButton", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  function renderButton(
    state: RecordingState,
    progress = 0,
    onStart = vi.fn(),
    onStop = vi.fn(),
  ) {
    act(() => {
      root.render(
        <RecordButton
          state={state}
          progress={progress}
          onStart={onStart}
          onStop={onStop}
        />,
      );
    });

    return { onStart, onStop };
  }

  function button() {
    const recordButton = container.querySelector("button");
    expect(recordButton).not.toBeNull();
    return recordButton!;
  }

  function recordRing() {
    return container.querySelector("[data-record-ring-hidden]");
  }

  it("renders a single continuous progress ring", () => {
    renderButton("recording", 50);

    expect(container.querySelectorAll("[data-record-ring-track]")).toHaveLength(1);
    expect(container.querySelectorAll("[data-record-progress-ring]")).toHaveLength(1);
    expect(container.querySelectorAll("[data-record-segment]")).toHaveLength(0);
    expect(container.querySelectorAll("[data-record-progress-segment]")).toHaveLength(0);
  });

  it("fades out the ring after recording completes", () => {
    renderButton("success", 100);

    expect(recordRing()).toHaveAttribute("data-record-ring-hidden", "true");
  });

  it("keeps the ring visible while idle or blocked", () => {
    renderButton("idle");
    expect(recordRing()).toHaveAttribute("data-record-ring-hidden", "false");

    renderButton("error");
    expect(recordRing()).toHaveAttribute("data-record-ring-hidden", "false");
  });

  it("starts once on pointer down and stops once on pointer up", () => {
    const handlers = renderButton("idle");

    act(() => {
      button().dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      button().dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      button().dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
      button().dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
    });

    expect(handlers.onStart).toHaveBeenCalledTimes(1);
    expect(handlers.onStop).toHaveBeenCalledTimes(1);
  });

  it("stops active pointer recording on pointer leave", () => {
    const handlers = renderButton("idle");

    act(() => {
      button().dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      button().dispatchEvent(new PointerEvent("pointerout", { bubbles: true }));
    });

    expect(handlers.onStart).toHaveBeenCalledTimes(1);
    expect(handlers.onStop).toHaveBeenCalledTimes(1);
  });

  it("does not start from click alone", () => {
    const handlers = renderButton("idle");

    act(() => {
      button().dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(handlers.onStart).not.toHaveBeenCalled();
    expect(handlers.onStop).not.toHaveBeenCalled();
  });

  it("starts and stops from Space key hold", () => {
    const handlers = renderButton("idle");

    act(() => {
      button().dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: " " }));
      button().dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: " " }));
    });

    expect(handlers.onStart).toHaveBeenCalledTimes(1);
    expect(handlers.onStop).toHaveBeenCalledTimes(1);
  });

  it("starts and stops from Enter key hold", () => {
    const handlers = renderButton("idle");

    act(() => {
      button().dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter" }));
      button().dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "Enter" }));
    });

    expect(handlers.onStart).toHaveBeenCalledTimes(1);
    expect(handlers.onStop).toHaveBeenCalledTimes(1);
  });
});
