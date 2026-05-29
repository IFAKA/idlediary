"use client";

import { useEffect, useState } from "react";

declare global {
  interface Window {
    __idleDiaryDemoTap?: (x: number, y: number) => void;
  }
}

type Ripple = {
  id: number;
  x: number;
  y: number;
};

export function DemoTapOverlay() {
  const [ripples, setRipples] = useState<Ripple[]>([]);

  useEffect(() => {
    let nextId = 0;

    window.__idleDiaryDemoTap = (x, y) => {
      const id = nextId;
      nextId += 1;
      setRipples((current) => [...current, { id, x, y }]);
      window.setTimeout(() => {
        setRipples((current) => current.filter((ripple) => ripple.id !== id));
      }, 420);
    };

    return () => {
      delete window.__idleDiaryDemoTap;
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[120]"
      data-testid="demo-tap-overlay"
    >
      {ripples.map((ripple) => (
        <span
          key={ripple.id}
          className="demo-tap-ripple"
          data-testid="demo-tap-ripple"
          style={{ left: ripple.x, top: ripple.y }}
        />
      ))}
    </div>
  );
}
