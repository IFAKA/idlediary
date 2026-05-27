"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState } from "react";

const counterPulseTransition = {
  type: "spring",
  stiffness: 520,
  damping: 24,
  mass: 0.65,
} as const;

const digitTransition = {
  type: "spring",
  stiffness: 680,
  damping: 32,
  mass: 0.62,
} as const;

type ItemCounterProps = {
  value: number;
  "aria-label"?: string;
};

type ItemCountStackProps = {
  value: number;
  singular: string;
  plural: string;
};

export function ItemCountStack({ value, singular, plural }: ItemCountStackProps) {
  return (
    <span className="inline-flex min-w-14 flex-col items-end justify-start gap-0.5 tabular-nums">
      <span className="text-lg font-semibold leading-none">
        <ItemCounter value={value} aria-label={String(value)} />
      </span>
      <span className="text-[11px] font-medium leading-none text-muted-foreground">
        {value === 1 ? singular : plural}
      </span>
    </span>
  );
}

export function ItemCounter({ value, "aria-label": ariaLabel }: ItemCounterProps) {
  const reducedMotion = useReducedMotion() === true;
  const [counterState, setCounterState] = useState<{
    value: number;
    direction: 1 | -1;
  }>({
    value,
    direction: 1,
  });
  const direction = counterState.direction;
  const digits = String(value).split("");

  if (value !== counterState.value) {
    setCounterState({ value, direction: value > counterState.value ? 1 : -1 });
  }

  return (
    <span className="inline-flex items-center tabular-nums" aria-label={ariaLabel}>
      <motion.span
        className="inline-flex items-center"
        layout
        aria-hidden={ariaLabel ? true : undefined}
        initial={false}
        animate={
          reducedMotion
            ? undefined
            : {
                scale: [1, direction > 0 ? 1.1 : 0.94, 1],
                y: [0, direction > 0 ? -1 : 1, 0],
                filter: ["brightness(1)", "brightness(1.18)", "brightness(1)"],
              }
        }
        transition={counterPulseTransition}
      >
        {digits.map((digit, index) => {
          const place = digits.length - index - 1;

          return (
            <motion.span
              className="relative inline-block h-[1em] w-[0.62em] overflow-hidden text-center"
              key={place}
              layout
            >
              <AnimatePresence initial={false} mode="popLayout">
                <motion.span
                  className="absolute inset-0"
                  key={`${place}-${digit}`}
                  animate={{ opacity: 1, y: 0 }}
                  exit={
                    reducedMotion
                      ? { opacity: 0 }
                      : {
                          opacity: 0,
                          scale: 0.82,
                          y: direction > 0 ? "-72%" : "72%",
                        }
                  }
                  initial={
                    reducedMotion
                      ? { opacity: 0 }
                      : {
                          opacity: 0,
                          scale: 1.12,
                          y: direction > 0 ? "72%" : "-72%",
                        }
                  }
                  transition={reducedMotion ? { duration: 0 } : digitTransition}
                >
                  {digit}
                </motion.span>
              </AnimatePresence>
            </motion.span>
          );
        })}
      </motion.span>
    </span>
  );
}
