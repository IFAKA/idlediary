import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type AppHeaderProps = {
  eyebrow: ReactNode;
  title: ReactNode;
  titleAs?: "h1" | "h2";
  leading?: ReactNode;
  trailing?: ReactNode;
  className?: string;
};

export function AppHeader({
  eyebrow,
  title,
  titleAs: Title = "h1",
  leading,
  trailing,
  className,
}: AppHeaderProps) {
  return (
    <header
      className={cn(
        "flex shrink-0 items-start justify-between gap-4",
        className,
      )}
    >
      {leading}
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
          {eyebrow}
        </p>
        <Title className="mt-1 text-2xl font-semibold leading-tight">
          {title}
        </Title>
      </div>
      {trailing}
    </header>
  );
}
