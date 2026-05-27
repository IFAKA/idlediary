"use client";

import type { LucideIcon } from "lucide-react";
import { BookOpenText, Camera, CircleDot, LockKeyhole, Sparkles } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { Button } from "@/components/ui/button";

type FirstLaunchIntroProps = {
  onStart: () => void;
};

type IntroStep = {
  icon: LucideIcon;
  title: string;
  detail: string;
};

const steps: IntroStep[] = [
  {
    icon: CircleDot,
    title: "Capture 2 seconds",
    detail: "Hold one small moment from the day.",
  },
  {
    icon: LockKeyhole,
    title: "Keep it local",
    detail: "Camera and microphone access begins only when you record.",
  },
  {
    icon: Sparkles,
    title: "Generate the diary",
    detail: "Turn the saved clips into a short video entry.",
  },
];

function motionDelay(index: number, reducedMotion: boolean) {
  return reducedMotion ? 0 : 0.42 + index * 0.58;
}

export function FirstLaunchIntro({ onStart }: FirstLaunchIntroProps) {
  const shouldReduceMotion = useReducedMotion() === true;

  return (
    <div className="relative z-10 flex h-[100svh] flex-col overflow-hidden safe-screen">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-24 border-b border-white/10 bg-[linear-gradient(90deg,rgba(255,255,255,0.12)_1px,transparent_1px),linear-gradient(180deg,rgba(255,255,255,0.08)_1px,transparent_1px)] bg-[size:28px_28px]"
        aria-hidden="true"
      />

      <div className="flex min-h-0 flex-1 flex-col justify-between gap-7">
        <motion.header
          className="pt-5"
          animate={{ opacity: 1, y: 0 }}
          initial={shouldReduceMotion ? false : { opacity: 0, y: 12 }}
          transition={{ duration: 0.42, ease: "easeOut" }}
        >
          <div className="flex items-center gap-3">
            <div className="relative flex size-14 items-center justify-center rounded-lg border border-primary/45 bg-primary/12 text-primary shadow-[0_0_42px_rgba(73,207,151,0.22)]">
              <Camera className="size-7" />
              <BookOpenText className="absolute -bottom-1 -right-1 size-5 rounded-md bg-background p-0.5 text-accent" />
            </div>
            <div>
              <h1 className="text-3xl font-semibold leading-none">IdleDiary</h1>
              <p className="mt-2 max-w-64 text-sm leading-6 text-muted-foreground">
                A two-second diary that stays quiet until you ask it to make a video.
              </p>
            </div>
          </div>
        </motion.header>

        <section className="grid min-h-0 flex-1 content-center gap-4 py-4" aria-label="How IdleDiary works">
          {steps.map((step, index) => {
            const Icon = step.icon;

            return (
              <motion.div
                className="grid grid-cols-[3rem_1fr] items-start gap-4 rounded-lg border bg-black/38 p-3 backdrop-blur-sm"
                key={step.title}
                animate={{ opacity: 1, x: 0 }}
                initial={shouldReduceMotion ? false : { opacity: 0, x: index % 2 === 0 ? -18 : 18 }}
                transition={{
                  duration: shouldReduceMotion ? 0 : 0.46,
                  ease: "easeOut",
                  delay: motionDelay(index, shouldReduceMotion),
                }}
              >
                <div className="flex size-12 items-center justify-center rounded-md bg-white/8 text-primary">
                  <Icon className="size-5" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold leading-6">{step.title}</h2>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">{step.detail}</p>
                </div>
              </motion.div>
            );
          })}
        </section>

        <motion.div
          animate={{ opacity: 1, y: 0 }}
          initial={shouldReduceMotion ? false : { opacity: 0, y: 18 }}
          transition={{
            duration: shouldReduceMotion ? 0 : 0.42,
            ease: "easeOut",
            delay: shouldReduceMotion ? 0 : 2.35,
          }}
        >
          <Button className="h-14 w-full text-base" type="button" onClick={onStart}>
            <Camera className="size-5" />
            Start recording
          </Button>
        </motion.div>
      </div>
    </div>
  );
}
