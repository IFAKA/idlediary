"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import type { MouseEvent } from "react";
import type { LucideIcon } from "lucide-react";
import { Camera, CircleDot, LockKeyhole, Sparkles } from "lucide-react";
import {
  motion,
  useAnimationControls,
  useMotionValue,
  useReducedMotion,
  useSpring,
} from "motion/react";
import { Button } from "@/components/ui/button";

type FirstLaunchIntroProps = {
  onStart: () => void;
};

type IntroStep = {
  icon: LucideIcon;
  title: string;
  detail: string;
  iconClassName: string;
  cardClassName: string;
};

const steps: IntroStep[] = [
  {
    icon: CircleDot,
    title: "Hold to capture",
    detail: "Save one tiny moment.",
    iconClassName: "bg-accent/15 text-accent",
    cardClassName: "border-accent/20 bg-accent/6",
  },
  {
    icon: LockKeyhole,
    title: "Keep it local",
    detail: "Nothing starts until you hold record.",
    iconClassName: "bg-primary/15 text-primary",
    cardClassName: "border-primary/20 bg-primary/6",
  },
  {
    icon: Sparkles,
    title: "Generate the diary",
    detail: "Turn clips into a daily entry.",
    iconClassName: "bg-memory/15 text-memory",
    cardClassName: "border-memory/25 bg-memory/7",
  },
];

const heroDescription = "A quiet video diary for days worth remembering.";
const mountDuration = 0.42;
const cardMountDuration = 0.38;
const buttonMountDelay = mountDuration + steps.length * 0.08;
const blinkDelay = buttonMountDelay + 0.58;
const blinkDuration = 0.34;
const blinkEase = [0.25, 1, 0.5, 1] as const;
const pupilTravel = 22;
const cryTapCount = 2;
const cryTapWindowMs = 700;

function clampImpact(value: number) {
  return Math.max(-1, Math.min(1, value));
}

function prefersReducedMotionNow() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function FirstLaunchIntro({ onStart }: FirstLaunchIntroProps) {
  const shouldReduceMotion = useReducedMotion() === true;
  const iconRef = useRef<HTMLButtonElement>(null);
  const [isPupilAwake, setIsPupilAwake] = useState(false);
  const [tearKey, setTearKey] = useState<number | null>(null);
  const iconControls = useAnimationControls();
  const blinkControls = useAnimationControls();
  const iconTapTimesRef = useRef<number[]>([]);
  const tearTimerRef = useRef<number | null>(null);
  const pupilX = useMotionValue(256);
  const pupilY = useMotionValue(256);
  const smoothPupilX = useSpring(pupilX, { stiffness: 180, damping: 24, mass: 0.45 });
  const smoothPupilY = useSpring(pupilY, { stiffness: 180, damping: 24, mass: 0.45 });

  useEffect(() => {
    if (shouldReduceMotion) return;

    const awakeTimer = window.setTimeout(
      () => setIsPupilAwake(true),
      (blinkDelay + blinkDuration + 0.08) * 1000,
    );

    void iconControls.start({
      scaleY: [1, 0.985, 1],
      transition: { delay: blinkDelay, duration: blinkDuration, ease: blinkEase },
    });
    void blinkControls.start({
      scaleY: [0, 1, 0],
      transition: {
        delay: blinkDelay,
        duration: blinkDuration,
        ease: blinkEase,
        times: [0, 0.42, 1],
      },
    });

    return () => window.clearTimeout(awakeTimer);
  }, [blinkControls, iconControls, shouldReduceMotion]);

  useEffect(() => {
    return () => {
      if (tearTimerRef.current !== null) {
        window.clearTimeout(tearTimerRef.current);
      }
    };
  }, []);

  const updatePupilFromPointer = useCallback((clientX: number, clientY: number) => {
    if (iconRef.current === null) return;
    const bounds = iconRef.current.getBoundingClientRect();
    const pointerX = (clientX - (bounds.left + bounds.width / 2)) / bounds.width;
    const pointerY = (clientY - (bounds.top + bounds.height / 2)) / bounds.height;
    const distance = Math.hypot(pointerX, pointerY);
    const clamped = distance > 0.5 ? 0.5 / distance : 1;

    pupilX.set(256 + pointerX * clamped * pupilTravel * 2);
    pupilY.set(256 + pointerY * clamped * pupilTravel * 2);
  }, [pupilX, pupilY]);

  useEffect(() => {
    if (shouldReduceMotion || !isPupilAwake) return;

    function handleWindowPointerMove(event: globalThis.PointerEvent) {
      if (event.pointerType === "touch") return;
      updatePupilFromPointer(event.clientX, event.clientY);
    }

    window.addEventListener("pointermove", handleWindowPointerMove);
    return () => window.removeEventListener("pointermove", handleWindowPointerMove);
  }, [isPupilAwake, shouldReduceMotion, updatePupilFromPointer]);

  function replayBlink() {
    if (shouldReduceMotion) return;

    setIsPupilAwake(true);
    void iconControls.start({
      scaleY: [1, 0.982, 1],
      transition: { duration: blinkDuration, ease: blinkEase },
    });
    void blinkControls.start({
      scaleY: [0, 1, 0],
      transition: { duration: blinkDuration, ease: blinkEase, times: [0, 0.42, 1] },
    });
  }

  function playHurtReaction(event: MouseEvent<HTMLButtonElement>) {
    if (shouldReduceMotion || prefersReducedMotionNow()) return;

    const now = performance.now();
    iconTapTimesRef.current = [
      ...iconTapTimesRef.current.filter((time) => now - time <= cryTapWindowMs),
      now,
    ];
    const shouldCry = iconTapTimesRef.current.length >= cryTapCount;
    if (shouldCry) {
      iconTapTimesRef.current = [];
      setTearKey(now);
      if (tearTimerRef.current !== null) {
        window.clearTimeout(tearTimerRef.current);
      }
      tearTimerRef.current = window.setTimeout(() => {
        setTearKey(null);
        tearTimerRef.current = null;
      }, 900);
    }

    const bounds = event.currentTarget.getBoundingClientRect();
    const hasPointerPosition = event.clientX !== 0 || event.clientY !== 0;
    const impactX = hasPointerPosition
      ? clampImpact((event.clientX - (bounds.left + bounds.width / 2)) / (bounds.width / 2))
      : 0;
    const impactY = hasPointerPosition
      ? clampImpact((event.clientY - (bounds.top + bounds.height / 2)) / (bounds.height / 2))
      : 0;
    const recoilX = -impactX * 6;
    const recoilY = -impactY * 5;
    const tilt = impactX * 4 - impactY * 1.5;

    setIsPupilAwake(true);
    pupilX.set(256 - impactX * 26);
    pupilY.set(256 - impactY * 22);
    void iconControls.start({
      rotate: [0, tilt, -tilt * 0.58, tilt * 0.24, 0],
      scale: [1, 0.965, 1.025, 0.995, 1],
      x: [0, recoilX, -recoilX * 0.55, recoilX * 0.22, 0],
      y: [0, recoilY, -recoilY * 0.42, recoilY * 0.16, 0],
      transition: { duration: 0.46, ease: [0.34, 1.56, 0.64, 1] },
    });
    void blinkControls.start({
      scaleY: [0, 0.88, 0.28, 0.52, 0],
      transition: {
        duration: 0.46,
        ease: [0.34, 1.56, 0.64, 1],
        times: [0, 0.24, 0.48, 0.68, 1],
      },
    });
    window.setTimeout(() => {
      pupilX.set(256);
      pupilY.set(256);
    }, 260);
  }

  function handleIntroClick(event: MouseEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest("[data-intro-no-blink]") !== null) return;
    replayBlink();
  }

  return (
    <div
      className="relative z-10 flex h-[100svh] flex-col overflow-hidden"
      onClick={handleIntroClick}
    >
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_7%,hsl(var(--primary)/0.2),transparent_34%),radial-gradient(circle_at_15%_22%,hsl(var(--memory)/0.14),transparent_28%),linear-gradient(180deg,hsl(var(--surface-soft)/0.44),transparent_46%)]"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-36 border-b border-memory/10 bg-[linear-gradient(90deg,hsl(var(--memory)/0.1)_1px,transparent_1px),linear-gradient(180deg,hsl(var(--foreground)/0.05)_1px,transparent_1px)] bg-[size:30px_30px] opacity-65"
        aria-hidden="true"
      />

      <div className="relative flex h-full flex-1 flex-col px-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] pt-[calc(env(safe-area-inset-top)+1.1rem)]">
        <motion.header
          className="mx-auto flex min-h-0 w-full max-w-sm flex-1 flex-col items-center justify-center pb-4 pt-1 text-center min-[390px]:pb-6"
          animate={{ opacity: 1, y: 0 }}
          initial={shouldReduceMotion ? false : { opacity: 0, y: 12 }}
          transition={{ duration: shouldReduceMotion ? 0 : mountDuration, ease: "easeOut" }}
        >
          <div className="relative">
            <div
              className="absolute inset-3 rounded-[2rem] bg-primary/28 blur-3xl"
              aria-hidden="true"
            />
            <motion.button
              ref={iconRef}
              className="relative flex size-28 cursor-pointer select-none items-center justify-center rounded-[1.85rem] border border-primary/30 bg-background/88 p-1.5 shadow-[0_24px_80px_hsl(var(--primary)/0.24)] outline-none focus-visible:ring-2 focus-visible:ring-primary/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background min-[390px]:size-32 [&_*]:select-none"
              animate={shouldReduceMotion ? undefined : iconControls}
              onClick={(event) => {
                event.stopPropagation();
                playHurtReaction(event);
              }}
              aria-label="Nudge app icon"
              data-intro-no-blink
              type="button"
              whileHover={shouldReduceMotion ? undefined : { scale: 1.015 }}
              whileTap={shouldReduceMotion ? undefined : { scale: 0.985 }}
              onDragStart={(event) => event.preventDefault()}
            >
              <Image
                className="size-full select-none rounded-[1.48rem] min-[390px]:rounded-[1.58rem]"
                src="/icon.svg"
                width={128}
                height={128}
                alt=""
                aria-hidden="true"
                draggable={false}
              />
              <svg
                className="pointer-events-none absolute inset-1.5 z-10 size-[calc(100%-0.75rem)] rounded-[1.48rem] min-[390px]:rounded-[1.58rem]"
                viewBox="0 0 512 512"
                aria-hidden="true"
              >
                <defs>
                  <clipPath id="intro-icon-blink-clip">
                    <circle cx="256" cy="256" r="146" />
                  </clipPath>
                </defs>
                <g clipPath="url(#intro-icon-blink-clip)">
                  <circle cx="256" cy="256" fill="#de728d" r="86" />
                  <motion.circle
                    cx={shouldReduceMotion ? 256 : smoothPupilX}
                    cy={shouldReduceMotion ? 256 : smoothPupilY}
                    fill="#0e0a0c"
                    r="84"
                  />
                  <circle cx="338" cy="176" fill="#b89bd5" r="30" />
                </g>
                <g clipPath="url(#intro-icon-blink-clip)">
                  <motion.rect
                    animate={shouldReduceMotion ? undefined : blinkControls}
                    fill="#0e0a0c"
                    height="146"
                    width="292"
                    x="110"
                    y="110"
                    initial={{ scaleY: 0 }}
                    style={{ originY: 0 }}
                  />
                  <motion.rect
                    animate={shouldReduceMotion ? undefined : blinkControls}
                    fill="#0e0a0c"
                    height="146"
                    width="292"
                    x="110"
                    y="256"
                    initial={{ scaleY: 0 }}
                    style={{ originY: 1 }}
                  />
                </g>
                {tearKey !== null && !shouldReduceMotion ? (
                  <g>
                    <motion.path
                      key={tearKey}
                      d="M402 256 C425 285 437 307 437 329 C437 354 421 371 402 371 C383 371 369 354 373 331 C377 308 392 283 402 256 Z"
                      fill="#a9c7ff"
                      opacity="0.9"
                      data-testid="intro-logo-tear"
                      initial={{ opacity: 0, x: 0, y: -5, scale: 0.72 }}
                      animate={{
                        opacity: [0, 0.9, 0.72, 0],
                        x: [0, 3, 5, 7],
                        y: [0, 16, 38, 60],
                        scale: [0.72, 1.1, 1.02, 0.92],
                      }}
                      transition={{ duration: 0.82, ease: "easeOut", times: [0, 0.18, 0.72, 1] }}
                    />
                  </g>
                ) : null}
              </svg>
            </motion.button>
          </div>

          <h1 className="mt-5 text-[2.65rem] font-semibold leading-none tracking-normal min-[390px]:text-5xl">
            IdleDiary
          </h1>
          <p className="mt-3 max-w-72 text-base leading-6 text-muted-foreground min-[390px]:text-[1.05rem]">
            {heroDescription}
          </p>
        </motion.header>

        <section
          className="mx-auto grid w-full max-w-sm shrink-0 gap-2.5 pb-3.5 min-[390px]:gap-3 min-[390px]:pb-4"
          aria-label="How IdleDiary works"
        >
          {steps.map((step, index) => {
            const Icon = step.icon;
            const mountDelay = shouldReduceMotion ? 0 : mountDuration + index * 0.08;

            return (
              <motion.div
                className={`grid min-h-[4.45rem] grid-cols-[2.65rem_1fr] items-center gap-3 rounded-lg border px-3 py-2.5 shadow-[0_16px_48px_hsl(var(--background)/0.22)] backdrop-blur-md ${step.cardClassName}`}
                key={step.title}
                animate={{ opacity: 1, x: 0 }}
                initial={shouldReduceMotion ? false : { opacity: 0, x: index % 2 === 0 ? -12 : 12 }}
                transition={{
                  duration: shouldReduceMotion ? 0 : cardMountDuration,
                  ease: "easeOut",
                  delay: mountDelay,
                }}
              >
                <div className={`flex size-10 items-center justify-center rounded-md ${step.iconClassName}`}>
                  <Icon className="size-[1.1rem]" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-[0.98rem] font-semibold leading-5">{step.title}</h2>
                  <p className="mt-0.5 text-sm leading-5 text-muted-foreground">{step.detail}</p>
                </div>
              </motion.div>
            );
          })}
        </section>

        <motion.div
          className="mx-auto w-full max-w-sm shrink-0"
          animate={{ opacity: 1, y: 0 }}
          initial={shouldReduceMotion ? false : { opacity: 0, y: 18 }}
          transition={{
            duration: shouldReduceMotion ? 0 : 0.42,
            ease: "easeOut",
            delay: shouldReduceMotion ? 0 : buttonMountDelay,
          }}
        >
          <Button
            className="h-[3.25rem] w-full rounded-lg text-base shadow-[0_18px_54px_hsl(var(--primary)/0.28)]"
            data-intro-no-blink
            type="button"
            onClick={onStart}
          >
            <Camera className="size-5" />
            Start recording
          </Button>
        </motion.div>
      </div>
    </div>
  );
}
