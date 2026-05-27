"use client";

import { Check, Circle, Loader2, X } from "lucide-react";
import { motion } from "motion/react";
import { spring, twoSecondRecordMs } from "@/lib/motion";
import { cn } from "@/lib/utils";
import type { RecordingState } from "./use-two-second-recorder";

type RecordButtonProps = {
  state: RecordingState;
  progress: number;
  disabled?: boolean;
  onClick: () => void;
};

export function RecordButton({ state, progress, disabled, onClick }: RecordButtonProps) {
  const isRecording = state === "recording";
  const isSaving = state === "saving";
  const isSuccess = state === "success";
  const isInactive = state === "idle" || state === "error";
  const circumference = 282.743;
  const progressOffset = isInactive ? circumference : circumference * (1 - progress / 100);

  return (
    <motion.button
      aria-label={isRecording ? "Cancel recording" : "Record three second clip"}
      className={cn(
        "relative grid size-24 place-items-center rounded-full border border-white/18 bg-black/45 shadow-[0_20px_80px_rgba(0,0,0,0.45)] outline-none",
        "focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        disabled && "pointer-events-none opacity-45",
      )}
      disabled={disabled}
      type="button"
      whileTap={{ scale: disabled ? 1 : 0.96 }}
      transition={spring}
      onClick={onClick}
    >
      <svg className="absolute inset-1 -rotate-90" viewBox="0 0 100 100" aria-hidden="true">
        <circle
          cx="50"
          cy="50"
          fill="none"
          r="45"
          stroke="rgba(255,255,255,0.18)"
          strokeWidth="5"
        />
        <motion.circle
          key={isRecording ? "recording-progress" : state}
          className={cn(isRecording && "record-progress-ring")}
          cx="50"
          cy="50"
          fill="none"
          r="45"
          stroke="hsl(var(--primary))"
          strokeLinecap="round"
          strokeWidth="5"
          style={{
            opacity: isInactive ? 0 : 1,
            strokeDasharray: circumference,
            strokeDashoffset: isRecording ? circumference : progressOffset,
            animationDuration: `${twoSecondRecordMs}ms`,
          }}
          initial={false}
          animate={isRecording ? undefined : { strokeDashoffset: progressOffset }}
          transition={{
            duration: isInactive ? 0.01 : 0.12,
            ease: "easeOut",
          }}
        />
      </svg>
      <motion.span
        className={cn(
          "grid size-16 place-items-center rounded-full",
          isRecording ? "bg-accent text-accent-foreground" : "bg-primary text-primary-foreground",
        )}
        animate={{ scale: isRecording ? 0.82 : 1 }}
        transition={spring}
      >
        {isSaving ? (
          <Loader2 className="size-7 animate-spin" />
        ) : isSuccess ? (
          <Check className="size-8" />
        ) : isRecording ? (
          <X className="size-8" />
        ) : (
          <Circle className="size-8" />
        )}
      </motion.span>
    </motion.button>
  );
}
