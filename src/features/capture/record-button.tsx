"use client";

import { Check, Circle, Loader2, X } from "lucide-react";
import { motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { spring, twoSecondRecordMs } from "@/lib/motion";
import { cn } from "@/lib/utils";
import type { RecordingState } from "./use-two-second-recorder";

type RecordButtonProps = {
  state: RecordingState;
  progress: number;
  disabled?: boolean;
  onClick: () => void;
};

const recordingMarkerSeconds = [1, 2, 3] as const;
const markerPulseMs = 420;

export function RecordButton({ state, progress, disabled, onClick }: RecordButtonProps) {
  const [activePulseSecond, setActivePulseSecond] = useState<number | null>(null);
  const pulseTimersRef = useRef<number[]>([]);
  const isRecording = state === "recording";
  const isSaving = state === "saving";
  const isSuccess = state === "success";
  const isInactive = state === "idle" || state === "error";
  const circumference = 282.743;
  const progressOffset = isInactive ? circumference : circumference * (1 - progress / 100);

  const clearPulseTimers = useCallback(() => {
    for (const timer of pulseTimersRef.current) {
      window.clearTimeout(timer);
    }
    pulseTimersRef.current = [];
  }, []);

  useEffect(() => {
    clearPulseTimers();

    if (!isRecording) {
      return;
    }

    const resetTimer = window.setTimeout(() => {
      setActivePulseSecond(null);
    }, 0);
    pulseTimersRef.current.push(resetTimer);

    for (const second of recordingMarkerSeconds) {
      const pulseTimer = window.setTimeout(() => {
        setActivePulseSecond(second);

        const clearTimer = window.setTimeout(() => {
          setActivePulseSecond((currentSecond) => (currentSecond === second ? null : currentSecond));
        }, markerPulseMs);

        pulseTimersRef.current.push(clearTimer);
      }, (twoSecondRecordMs / recordingMarkerSeconds.length) * second);

      pulseTimersRef.current.push(pulseTimer);
    }

    return clearPulseTimers;
  }, [clearPulseTimers, isRecording]);

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
        {recordingMarkerSeconds.map((second) => {
          const isActivePulse = isRecording && activePulseSecond === second;

          return (
            <motion.line
              key={second}
              data-record-marker={second}
              data-record-marker-active={isActivePulse ? "true" : "false"}
              x1="50"
              x2="50"
              y1="5"
              y2="11"
              stroke="hsl(var(--primary))"
              strokeLinecap="round"
              strokeWidth="2.5"
              style={{
                filter: isActivePulse ? "drop-shadow(0 0 8px hsl(var(--primary)))" : "none",
                opacity: isRecording ? 0.36 : 0,
                transformBox: "fill-box",
                transformOrigin: "center",
              }}
              initial={false}
              animate={{
                opacity: isRecording ? (isActivePulse ? 1 : 0.36) : 0,
                scale: isActivePulse ? 1.42 : 1,
                strokeWidth: isActivePulse ? 4 : 2.5,
              }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              transform={`rotate(${(360 / recordingMarkerSeconds.length) * second} 50 50)`}
            />
          );
        })}
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
