"use client";

import { Check, Circle, Loader2, X } from "lucide-react";
import { motion } from "motion/react";
import type { CSSProperties } from "react";
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
const markerPulseMs = 1450;
const ringCircumference = 282.743;
const segmentGap = 10;
const segmentStep = ringCircumference / recordingMarkerSeconds.length;
const segmentLength = segmentStep - segmentGap;
const segmentDashPattern = `${segmentLength} ${ringCircumference - segmentLength}`;
const markerRadius = 45;
const progressSegmentDurationMs = twoSecondRecordMs / recordingMarkerSeconds.length;
const poofParticles = [
  { dx: 0, dy: -15, r: 3.8, delay: 0, rotate: -8, opacity: 0.42 },
  { dx: 10, dy: -12, r: 3.1, delay: 36, rotate: 14, opacity: 0.34 },
  { dx: -10, dy: -11, r: 3.4, delay: 58, rotate: -18, opacity: 0.36 },
  { dx: 14, dy: -3, r: 2.7, delay: 82, rotate: 24, opacity: 0.3 },
  { dx: -14, dy: -2, r: 2.8, delay: 96, rotate: -26, opacity: 0.32 },
  { dx: 4, dy: 8, r: 2.4, delay: 112, rotate: 18, opacity: 0.26 },
] as const;

type PoofParticleStyle = CSSProperties & {
  "--poof-x": string;
  "--poof-y": string;
  "--poof-delay": string;
  "--poof-rotate": string;
  "--poof-opacity": number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function svgNumber(value: number) {
  return value.toFixed(3);
}

function pointOnRing(second: number) {
  const angle = (360 / recordingMarkerSeconds.length) * second;
  const radians = (angle * Math.PI) / 180;

  return {
    x: svgNumber(50 + markerRadius * Math.cos(radians)),
    y: svgNumber(50 + markerRadius * Math.sin(radians)),
  };
}

export function RecordButton({ state, progress, disabled, onClick }: RecordButtonProps) {
  const [activePulseSeconds, setActivePulseSeconds] = useState<number[]>([]);
  const pulseTimersRef = useRef<number[]>([]);
  const isRecording = state === "recording";
  const isSaving = state === "saving";
  const isSuccess = state === "success";
  const isInactive = state === "idle" || state === "error";
  const shouldHideRing = isSaving || isSuccess;

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
        setActivePulseSeconds([]);
      }, 0);

      return () => window.clearTimeout(resetTimer);
    }

    const resetTimer = window.setTimeout(() => {
      setActivePulseSeconds([]);
    }, 0);
    pulseTimersRef.current.push(resetTimer);

    for (const second of recordingMarkerSeconds) {
      const pulseTimer = window.setTimeout(() => {
        setActivePulseSeconds((currentSeconds) =>
          currentSeconds.includes(second) ? currentSeconds : [...currentSeconds, second],
        );

        const clearTimer = window.setTimeout(() => {
          setActivePulseSeconds((currentSeconds) => currentSeconds.filter((currentSecond) => currentSecond !== second));
        }, markerPulseMs);

        pulseTimersRef.current.push(clearTimer);
      }, (twoSecondRecordMs / recordingMarkerSeconds.length) * second);

      pulseTimersRef.current.push(pulseTimer);
    }

    return clearPulseTimers;
  }, [clearPulseTimers, isRecording]);

  function progressSegmentLength(index: number) {
    const segmentProgress = clamp((progress / 100) * recordingMarkerSeconds.length - index, 0, 1);

    return segmentLength * segmentProgress;
  }

  return (
    <motion.button
      aria-label={isRecording ? "Cancel recording" : "Record three second clip"}
      className={cn(
        "relative grid size-24 place-items-center overflow-visible rounded-full border border-white/18 bg-black/45 shadow-[0_20px_80px_rgba(0,0,0,0.45)] outline-none",
        "focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        disabled && "pointer-events-none opacity-45",
      )}
      disabled={disabled}
      type="button"
      whileTap={{ scale: disabled ? 1 : 0.96 }}
      transition={spring}
      onClick={onClick}
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
        {recordingMarkerSeconds.map((second, index) => {
          const filledLength = isRecording ? 0 : progressSegmentLength(index);
          const recordingDelaySeconds = (index * progressSegmentDurationMs) / 1000;
          const hiddenDashPattern = `0 ${ringCircumference}`;
          const visibleDashPattern = `${segmentLength} ${ringCircumference - segmentLength}`;
          const progressDashPattern = `${filledLength} ${ringCircumference - filledLength}`;
          const hasProgress = filledLength > 0.1;

          return (
            <motion.circle
              key={`progress-segment-${second}-${isRecording ? "recording" : state}`}
              data-record-progress-segment={second}
              cx="50"
              cy="50"
              fill="none"
              r={markerRadius}
              stroke="hsl(var(--primary))"
              strokeDashoffset={-(segmentStep * index + segmentGap / 2)}
              strokeLinecap="round"
              strokeWidth="6"
              initial={isRecording ? { opacity: 0, strokeDasharray: hiddenDashPattern } : false}
              animate={{
                opacity: isInactive ? 0 : isRecording ? [0, 0, 1] : hasProgress ? 1 : 0,
                strokeDasharray: isRecording ? visibleDashPattern : progressDashPattern,
              }}
              transition={{
                opacity: isRecording
                  ? {
                      delay: recordingDelaySeconds,
                      duration: 0.06,
                      ease: "easeOut",
                      times: [0, 0.45, 1],
                    }
                  : { duration: 0.08, ease: "easeOut" },
                strokeDasharray: {
                  delay: isRecording ? recordingDelaySeconds : 0,
                  duration: isRecording ? progressSegmentDurationMs / 1000 : 0.12,
                  ease: "linear",
                },
              }}
            />
          );
        })}
        {recordingMarkerSeconds.map((second, index) => {
          const isActivePulse = isRecording && activePulseSeconds.includes(second);

          return (
            <circle
              key={`segment-pulse-${second}`}
              className="record-segment-pulse"
              data-record-segment-pulse={second}
              data-record-segment-pulse-active={isActivePulse ? "true" : "false"}
              cx="50"
              cy="50"
              fill="none"
              r={markerRadius}
              stroke="hsl(var(--primary))"
              strokeDasharray={segmentDashPattern}
              strokeDashoffset={-(segmentStep * index + segmentGap / 2)}
              strokeLinecap="round"
              strokeWidth="7"
            />
          );
        })}
        {recordingMarkerSeconds.map((second) => {
          const isActivePulse = isRecording && activePulseSeconds.includes(second);
          const markerPoint = pointOnRing(second);

          return (
            <g key={second} data-record-poof={second}>
              <circle
                className="record-marker-pulse"
                data-record-marker={second}
                data-record-marker-active={isActivePulse ? "true" : "false"}
                cx={markerPoint.x}
                cy={markerPoint.y}
                fill="hsl(var(--primary))"
                r="3.1"
                stroke="rgba(255,255,255,0.52)"
                strokeWidth="1"
              />
              {poofParticles.map((particle, particleIndex) => {
                const particleStyle: PoofParticleStyle = {
                  "--poof-x": `${particle.dx}px`,
                  "--poof-y": `${particle.dy}px`,
                  "--poof-delay": `${particle.delay}ms`,
                  "--poof-rotate": `${particle.rotate}deg`,
                  "--poof-opacity": particle.opacity,
                };

                return (
                  <circle
                    key={`${second}-${particleIndex}`}
                    className="record-poof-particle"
                    data-record-poof-particle={second}
                    data-record-poof-particle-active={isActivePulse ? "true" : "false"}
                    cx={markerPoint.x}
                    cy={markerPoint.y}
                    fill={particleIndex % 2 === 0 ? "rgba(248,244,255,0.72)" : "rgba(228,218,246,0.62)"}
                    r={particle.r}
                    style={particleStyle}
                  />
                );
              })}
            </g>
          );
        })}
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
          <X className="size-8" />
        ) : (
          <Circle className="size-8" />
        )}
      </motion.span>
    </motion.button>
  );
}
