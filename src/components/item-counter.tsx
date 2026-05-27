"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState } from "react";

const digitTransition = { duration: 0.18, ease: "easeOut" } as const;

type ItemCounterProps = {
  value: number;
  "aria-label"?: string;
};

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
                          y: direction > 0 ? "-100%" : "100%",
                        }
                  }
                  initial={
                    reducedMotion
                      ? { opacity: 0 }
                      : {
                          opacity: 0,
                          y: direction > 0 ? "100%" : "-100%",
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
