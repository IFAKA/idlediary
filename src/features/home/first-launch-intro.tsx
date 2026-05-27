"use client";

import { useEffect, useState } from "react";
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
    detail: "Hold one small moment from the day.",
    iconClassName: "bg-accent/15 text-accent",
    cardClassName: "border-accent/20 bg-surface-soft/72",
  },
  {
    icon: LockKeyhole,
    title: "Keep it local",
    detail: "Camera and microphone access begins only when you record.",
    iconClassName: "bg-primary/15 text-primary",
    cardClassName: "border-primary/20 bg-surface-soft/72",
  },
  {
    icon: Sparkles,
    title: "Generate the diary",
    detail: "Turn the saved clips into a short video entry.",
    iconClassName: "bg-memory/15 text-memory",
    cardClassName: "border-memory/25 bg-surface-soft/72",
  },
];

const heroDescription = "A three-second diary that stays quiet until you ask it to make a video.";
const mountDuration = 0.42;
const cardMountDuration = 0.46;
const typingSpeed = 0.024;
const sequenceGap = 0.12;

function typingDuration(text: string) {
  return text.length * typingSpeed;
}

function stepMountDelay(index: number) {
  let delay = mountDuration + typingDuration(heroDescription) + sequenceGap;

  for (let currentIndex = 0; currentIndex < index; currentIndex += 1) {
    delay += cardMountDuration + typingDuration(steps[currentIndex].detail) + sequenceGap;
  }

  return delay;
}

function buttonMountDelay() {
  const finalStep = steps[steps.length - 1];
  return stepMountDelay(steps.length - 1) + cardMountDuration + typingDuration(finalStep.detail) + sequenceGap;
}

function TypedDescription({
  className,
  delay,
  reducedMotion,
  text,
}: {
  className?: string;
  delay: number;
  reducedMotion: boolean;
  text: string;
}) {
  const [typedText, setTypedText] = useState("");
  const visibleText = reducedMotion ? text : typedText;

  useEffect(() => {
    if (reducedMotion) return;

    let currentIndex = 0;
    let interval: number | undefined;
    const timeout = window.setTimeout(() => {
      interval = window.setInterval(() => {
        currentIndex += 1;
        setTypedText(text.slice(0, currentIndex));

        if (currentIndex >= text.length && interval !== undefined) {
          window.clearInterval(interval);
        }
      }, typingSpeed * 1000);
    }, delay * 1000);

    return () => {
      window.clearTimeout(timeout);
      if (interval !== undefined) window.clearInterval(interval);
    };
  }, [delay, reducedMotion, text]);

  return (
    <p className={`relative ${className ?? ""}`} aria-label={text} data-streaming-text>
      <span className="invisible block" aria-hidden="true">
        {text}
      </span>
      <span className="absolute inset-0 block" aria-hidden="true">
        {visibleText}
      </span>
    </p>
  );
}

export function FirstLaunchIntro({ onStart }: FirstLaunchIntroProps) {
  const shouldReduceMotion = useReducedMotion() === true;

  return (
    <div className="relative z-10 flex h-[100svh] flex-col overflow-hidden safe-screen">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-24 border-b border-memory/15 bg-[linear-gradient(90deg,hsl(var(--memory)/0.14)_1px,transparent_1px),linear-gradient(180deg,hsl(var(--foreground)/0.06)_1px,transparent_1px)] bg-[size:28px_28px]"
        aria-hidden="true"
      />

      <div className="flex min-h-0 flex-1 flex-col justify-between gap-7">
        <motion.header
          className="pt-5"
          animate={{ opacity: 1, y: 0 }}
          initial={shouldReduceMotion ? false : { opacity: 0, y: 12 }}
          transition={{ duration: shouldReduceMotion ? 0 : mountDuration, ease: "easeOut" }}
        >
          <div className="flex items-center gap-3">
            <div className="flex size-14 shrink-0 items-center justify-center rounded-[1.05rem] border border-primary/35 bg-background/80 p-1 shadow-[0_0_42px_hsl(var(--primary)/0.22)]">
              <Image
                className="size-full rounded-[0.85rem]"
                src="/icon.svg"
                width={56}
                height={56}
                alt=""
                aria-hidden="true"
                priority
              />
            </div>
            <div>
              <h1 className="text-3xl font-semibold leading-none">IdleDiary</h1>
              <TypedDescription
                className="mt-2 max-w-64 text-sm leading-6 text-muted-foreground"
                delay={shouldReduceMotion ? 0 : mountDuration}
                reducedMotion={shouldReduceMotion}
                text={heroDescription}
              />
            </div>
          </div>
        </motion.header>

        <section className="grid min-h-0 flex-1 content-center gap-4 py-4" aria-label="How IdleDiary works">
          {steps.map((step, index) => {
            const Icon = step.icon;
            const mountDelay = shouldReduceMotion ? 0 : stepMountDelay(index);

            return (
              <motion.div
                className={`grid grid-cols-[3rem_1fr] items-start gap-4 rounded-lg border p-3 backdrop-blur-sm ${step.cardClassName}`}
                key={step.title}
                animate={{ opacity: 1, x: 0 }}
                initial={shouldReduceMotion ? false : { opacity: 0, x: index % 2 === 0 ? -18 : 18 }}
                transition={{
                  duration: shouldReduceMotion ? 0 : cardMountDuration,
                  ease: "easeOut",
                  delay: mountDelay,
                }}
              >
                <div className={`flex size-12 items-center justify-center rounded-md ${step.iconClassName}`}>
                  <Icon className="size-5" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold leading-6">{step.title}</h2>
                  <TypedDescription
                    className="mt-1 text-sm leading-6 text-muted-foreground"
                    delay={mountDelay + cardMountDuration}
                    reducedMotion={shouldReduceMotion}
                    text={step.detail}
                  />
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
            delay: shouldReduceMotion ? 0 : buttonMountDelay(),
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
