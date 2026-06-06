"use client";

import { Check, Circle, Loader2, Square } from "lucide-react";
import { motion } from "motion/react";
import { useCallback, useRef, type KeyboardEvent } from "react";
import { spring } from "@/lib/motion";
import { cn } from "@/lib/utils";
import type { RecordingState } from "./use-two-second-recorder";

type RecordButtonProps = {
  state: RecordingState;
  progress: number;
  disabled?: boolean;
  onStart: () => void;
  onStop: () => void;
};

const ringRadius = 45;
const ringCircumference = 282.743;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function isRecordKey(event: KeyboardEvent<HTMLButtonElement>) {
  return event.key === " " || event.code === "Space" || event.key === "Enter";
}

export function RecordButton({ state, progress, disabled, onStart, onStop }: RecordButtonProps) {
  const pointerRecordingRef = useRef(false);
  const keyRecordingRef = useRef(false);
  const isRecording = state === "recording";
  const isSaving = state === "saving";
  const isSuccess = state === "success";
  const isInactive = state === "idle" || state === "error";
  const shouldHideRing = isSaving || isSuccess;
  const progressOffset = ringCircumference * (1 - clamp(progress, 0, 100) / 100);

  const beginPointerRecording = useCallback(() => {
    if (disabled || isRecording || pointerRecordingRef.current) return;
    pointerRecordingRef.current = true;
    onStart();
  }, [disabled, isRecording, onStart]);

  const endPointerRecording = useCallback(() => {
    if (!pointerRecordingRef.current) return;
    pointerRecordingRef.current = false;
    onStop();
  }, [onStop]);

  const beginKeyRecording = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>) => {
      if (event.repeat || disabled || isRecording || !isRecordKey(event)) return;
      event.preventDefault();
      keyRecordingRef.current = true;
      onStart();
    },
    [disabled, isRecording, onStart],
  );

  const endKeyRecording = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>) => {
      if (!isRecordKey(event)) return;
      event.preventDefault();
      if (!keyRecordingRef.current) return;
      keyRecordingRef.current = false;
      onStop();
    },
    [onStop],
  );

  return (
    <motion.button
      aria-label={isRecording ? "Release to save" : "Hold to record"}
      className={cn(
        "relative grid size-24 touch-none select-none place-items-center overflow-visible rounded-full border border-white/18 bg-black/45 shadow-[0_20px_80px_rgba(0,0,0,0.45)] outline-none",
        "focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        disabled && "pointer-events-none opacity-45",
      )}
      disabled={disabled}
      type="button"
      whileTap={{ scale: disabled ? 1 : 0.96 }}
      transition={spring}
      onClick={(event) => event.preventDefault()}
      onKeyDown={beginKeyRecording}
      onKeyUp={endKeyRecording}
      onPointerCancel={endPointerRecording}
      onPointerDown={beginPointerRecording}
      onPointerLeave={endPointerRecording}
      onPointerOut={endPointerRecording}
      onPointerUp={endPointerRecording}
    >
      <motion.svg
        className="pointer-events-none absolute left-1/2 top-1/2 size-24 -translate-x-1/2 -translate-y-1/2 -rotate-90 overflow-visible"
        viewBox="0 0 100 100"
        aria-hidden="true"
        data-record-ring-hidden={shouldHideRing ? "true" : "false"}
        data-testid="record-button-ring"
        animate={{ opacity: shouldHideRing ? 0 : 1 }}
        transition={{ duration: shouldHideRing ? 0.22 : 0.16, ease: "easeOut" }}
      >
        <circle
          data-record-ring-track="true"
          cx="50"
          cy="50"
          fill="none"
          r={ringRadius}
          stroke="rgba(255,255,255,0.2)"
          strokeWidth="5"
        />
        <motion.circle
          data-record-progress-ring="true"
          cx="50"
          cy="50"
          fill="none"
          r={ringRadius}
          stroke="hsl(var(--primary))"
          strokeDasharray={ringCircumference}
          strokeDashoffset={progressOffset}
          strokeLinecap="round"
          strokeWidth="6"
          animate={{
            opacity: isInactive ? 0 : 1,
            strokeDashoffset: progressOffset,
          }}
          transition={{ duration: isRecording ? 0.05 : 0.12, ease: "linear" }}
        />
      </motion.svg>
      <motion.span
        className={cn(
          "grid size-16 place-items-center rounded-full",
          isRecording ? "bg-accent text-accent-foreground" : "bg-primary text-primary-foreground",
        )}
        data-testid="record-button-dot"
        animate={{ scale: isRecording ? 0.82 : 1 }}
        transition={spring}
      >
        {isSaving ? (
          <Loader2 className="size-7 animate-spin" />
        ) : isSuccess ? (
          <Check className="size-8" />
        ) : isRecording ? (
          <Square className="size-7 fill-current" />
        ) : (
          <Circle className="size-8" />
        )}
      </motion.span>
    </motion.button>
  );
}
