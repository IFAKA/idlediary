import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type AppViewportShellProps = {
  children: ReactNode;
  className?: string;
  frameClassName?: string;
};

export function AppViewportShell({
  children,
  className,
  frameClassName,
}: AppViewportShellProps) {
  return (
    <main className={cn("app-viewport-shell", className)}>
      <div className={cn("app-viewport-frame", frameClassName)}>{children}</div>
    </main>
  );
}
