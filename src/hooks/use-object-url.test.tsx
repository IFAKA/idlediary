import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useObjectUrl } from "./use-object-url";

function UrlProbe({
  blob,
  onSrc,
}: {
  blob: Blob;
  onSrc: (src: string | null) => void;
}) {
  onSrc(useObjectUrl(blob));
  return null;
}

describe("useObjectUrl", () => {
  const originalCreateObjectUrl = URL.createObjectURL;
  const originalRevokeObjectUrl = URL.revokeObjectURL;
  let container: HTMLDivElement;
  let root: Root;
  let isUnmounted: boolean;
  let nextUrlId = 0;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    isUnmounted = false;
    nextUrlId = 0;
    URL.createObjectURL = vi.fn(() => `blob:mock-${nextUrlId++}`);
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    if (!isUnmounted) {
      act(() => {
        root.unmount();
      });
    }
    container.remove();
    URL.createObjectURL = originalCreateObjectUrl;
    URL.revokeObjectURL = originalRevokeObjectUrl;
  });

  it("creates a fresh URL after Strict Mode effect cleanup", () => {
    const blob = new Blob(["video"], { type: "video/webm" });
    let latestSrc: string | null = null;

    act(() => {
      root.render(
        <StrictMode>
          <UrlProbe blob={blob} onSrc={(src) => (latestSrc = src)} />
        </StrictMode>,
      );
    });

    expect(URL.createObjectURL).toHaveBeenCalledTimes(2);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock-0");
    expect(latestSrc).toBe("blob:mock-1");

    act(() => {
      root.unmount();
    });
    isUnmounted = true;

    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock-1");
  });
});
