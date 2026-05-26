import { AppError } from "@/features/errors/app-error";
import { addDebugEvent } from "@/features/errors/debug-store";
import { reportError } from "@/features/errors/report-error";
import type { VlogRecord } from "@/features/clips/types";

export async function shareVlog(vlog: VlogRecord) {
  const file = new File([vlog.blob], `${vlog.title.replaceAll(" ", "-").toLowerCase()}.mp4`, {
    type: vlog.mimeType,
  });

  try {
    if (navigator.canShare?.({ files: [file] }) && navigator.share) {
      await navigator.share({
        title: vlog.title,
        text: vlog.caption,
        files: [file],
      });
      addDebugEvent("vlog-shared", "share", { vlogId: vlog.id, method: "share-sheet" });
      return;
    }

    downloadVlog(vlog);
  } catch (cause) {
    throw reportError(
      new AppError({
        code: "share-unavailable",
        area: "share",
        message: "Could not open share sheet",
        userMessage: "Sharing is not available here. Download the video instead.",
        cause,
        context: { vlogId: vlog.id, size: vlog.blob.size },
      }),
    );
  }
}

export function downloadVlog(vlog: VlogRecord) {
  try {
    const url = URL.createObjectURL(vlog.blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${vlog.title.replaceAll(" ", "-").toLowerCase()}.mp4`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
    addDebugEvent("vlog-downloaded", "share", { vlogId: vlog.id, size: vlog.blob.size });
  } catch (cause) {
    throw reportError(
      new AppError({
        code: "download-failed",
        area: "share",
        message: "Could not trigger download",
        userMessage: "The download could not start.",
        cause,
        context: { vlogId: vlog.id },
      }),
    );
  }
}
