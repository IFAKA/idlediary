"use client";

import Image from "next/image";
import type { LucideIcon } from "lucide-react";
import { Camera, CircleDot, LockKeyhole, Sparkles } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
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
    title: "Capture 3 seconds",
    detail: "Save one tiny moment.",
    iconClassName: "bg-accent/15 text-accent",
    cardClassName: "border-accent/20 bg-accent/6",
  },
  {
    icon: LockKeyhole,
    title: "Keep it local",
    detail: "Nothing starts until you tap record.",
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

const heroDescription = "A quiet three-second video diary for days worth remembering.";
const mountDuration = 0.42;
const cardMountDuration = 0.38;
const buttonMountDelay = mountDuration + steps.length * 0.08;
const blinkDelay = buttonMountDelay + 0.58;

export function FirstLaunchIntro({ onStart }: FirstLaunchIntroProps) {
  const shouldReduceMotion = useReducedMotion() === true;

  return (
    <div className="relative z-10 flex h-[100svh] flex-col overflow-hidden">
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
            <motion.div
              className="relative flex size-28 items-center justify-center rounded-[1.85rem] border border-primary/30 bg-background/88 p-1.5 shadow-[0_24px_80px_hsl(var(--primary)/0.24)] min-[390px]:size-32"
              animate={shouldReduceMotion ? undefined : { scaleY: [1, 0.985, 1] }}
              transition={
                shouldReduceMotion
                  ? undefined
                  : { delay: blinkDelay, duration: 0.34, ease: [0.25, 1, 0.5, 1] }
              }
            >
              <Image
                className="size-full rounded-[1.48rem] min-[390px]:rounded-[1.58rem]"
                src="/icon.svg"
                width={128}
                height={128}
                alt=""
                aria-hidden="true"
                priority
              />
              <svg
                className="pointer-events-none absolute inset-1.5 size-[calc(100%-0.75rem)] rounded-[1.48rem] min-[390px]:rounded-[1.58rem]"
                viewBox="0 0 512 512"
                aria-hidden="true"
              >
                <defs>
                  <clipPath id="intro-icon-blink-clip">
                    <circle cx="256" cy="256" r="146" />
                  </clipPath>
                </defs>
                <g clipPath="url(#intro-icon-blink-clip)">
                  <motion.rect
                    fill="#0e0a0c"
                    height="146"
                    width="292"
                    x="110"
                    y="110"
                    initial={{ scaleY: 0 }}
                    animate={shouldReduceMotion ? undefined : { scaleY: [0, 1, 0] }}
                    style={{ originY: 0 }}
                    transition={
                      shouldReduceMotion
                        ? undefined
                        : {
                            delay: blinkDelay,
                            duration: 0.34,
                            ease: [0.25, 1, 0.5, 1],
                            times: [0, 0.42, 1],
                          }
                    }
                  />
                  <motion.rect
                    fill="#0e0a0c"
                    height="146"
                    width="292"
                    x="110"
                    y="256"
                    initial={{ scaleY: 0 }}
                    animate={shouldReduceMotion ? undefined : { scaleY: [0, 1, 0] }}
                    style={{ originY: 1 }}
                    transition={
                      shouldReduceMotion
                        ? undefined
                        : {
                            delay: blinkDelay,
                            duration: 0.34,
                            ease: [0.25, 1, 0.5, 1],
                            times: [0, 0.42, 1],
                          }
                    }
                  />
                </g>
              </svg>
            </motion.div>
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
