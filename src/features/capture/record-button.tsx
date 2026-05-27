"use client";

import { Check, Circle, Loader2, X } from "lucide-react";
import { motion } from "motion/react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
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
const ringCircumference = 282.743;
const segmentGap = 10;
const segmentStep = ringCircumference / recordingMarkerSeconds.length;
const segmentLength = segmentStep - segmentGap;
const segmentedDashPattern = `${segmentLength} ${segmentGap}`;
const segmentDashPattern = `${segmentLength} ${ringCircumference - segmentLength}`;
const markerRadius = 45;

function pointOnRing(second: number) {
  const angle = (360 / recordingMarkerSeconds.length) * second;
  const radians = (angle * Math.PI) / 180;

  return {
    x: 50 + markerRadius * Math.cos(radians),
    y: 50 + markerRadius * Math.sin(radians),
  };
}

export function RecordButton({ state, progress, disabled, onClick }: RecordButtonProps) {
  const segmentedRingMaskId = `record-ring-mask-${useId().replace(/:/g, "")}`;
  const [activePulseSecond, setActivePulseSecond] = useState<number | null>(null);
  const pulseTimersRef = useRef<number[]>([]);
  const isRecording = state === "recording";
  const isSaving = state === "saving";
  const isSuccess = state === "success";
  const isInactive = state === "idle" || state === "error";
  const progressOffset = isInactive
    ? ringCircumference
    : ringCircumference * (1 - progress / 100);

  const clearPulseTimers = useCallback(() => {
    for (const timer of pulseTimersRef.current) {
      window.clearTimeout(timer);
    }
    pulseTimersRef.current = [];
  }, []);

  useEffect(() => {
    clearPulseTimers();

    if (!isRecording) {
      const resetTimer = window.setTimeout(() => {
        setActivePulseSecond(null);
      }, 0);

      return () => window.clearTimeout(resetTimer);
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
        <defs>
          <mask id={segmentedRingMaskId}>
            <circle
              cx="50"
              cy="50"
              fill="none"
              r={markerRadius}
              stroke="white"
              strokeDasharray={segmentedDashPattern}
              strokeDashoffset={segmentGap / 2}
              strokeLinecap="round"
              strokeWidth="8"
            />
          </mask>
        </defs>
        {recordingMarkerSeconds.map((second, index) => (
          <circle
            key={second}
            data-record-segment={second}
            cx="50"
            cy="50"
            fill="none"
            r={markerRadius}
            stroke="rgba(255,255,255,0.2)"
            strokeDasharray={segmentDashPattern}
            strokeDashoffset={-(segmentStep * index + segmentGap / 2)}
            strokeLinecap="round"
            strokeWidth="5"
          />
        ))}
        <motion.circle
          key={isRecording ? "recording-progress" : state}
          className={cn(isRecording && "record-progress-ring")}
          cx="50"
          cy="50"
          fill="none"
          mask={`url(#${segmentedRingMaskId})`}
          r={markerRadius}
          stroke="hsl(var(--primary))"
          strokeLinecap="round"
          strokeWidth="6"
          style={{
            opacity: isInactive ? 0 : 1,
            strokeDasharray: ringCircumference,
            strokeDashoffset: isRecording ? ringCircumference : progressOffset,
            animationDuration: `${twoSecondRecordMs}ms`,
          }}
          initial={false}
          animate={isRecording ? undefined : { strokeDashoffset: progressOffset }}
          transition={{
            duration: isInactive ? 0.01 : 0.12,
            ease: "easeOut",
          }}
        />
        {recordingMarkerSeconds.map((second) => {
          const isActivePulse = isRecording && activePulseSecond === second;
          const markerPoint = pointOnRing(second);

          return (
            <motion.circle
              key={second}
              data-record-marker={second}
              data-record-marker-active={isActivePulse ? "true" : "false"}
              cx={markerPoint.x}
              cy={markerPoint.y}
              fill="hsl(var(--primary))"
              r="3.5"
              stroke="hsl(var(--primary))"
              strokeWidth="2"
              style={{
                filter: isActivePulse
                  ? "drop-shadow(0 0 12px hsl(var(--primary))) drop-shadow(0 0 22px hsl(var(--primary)))"
                  : "none",
                opacity: 0,
                transformBox: "fill-box",
                transformOrigin: "center",
              }}
              initial={false}
              animate={{
                opacity: isActivePulse ? 1 : 0,
                scale: isActivePulse ? 2.2 : 0.75,
                strokeWidth: isActivePulse ? 4 : 2,
              }}
              transition={{ duration: 0.18, ease: "easeOut" }}
            />
          );
        })}
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
