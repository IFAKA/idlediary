"use client";

import { HeartHandshake } from "lucide-react";
import { cn } from "@/lib/utils";

const koFiUrl = "https://ko-fi.com/zfaka";

type SupportLinkProps = {
  className?: string;
  label?: string;
};

export function SupportLink({
  className,
  label = "Support FAKA",
}: SupportLinkProps) {
  return (
    <a
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-memory/25 bg-surface-soft/64 px-4 py-2 text-sm font-semibold text-foreground outline-none transition hover:border-memory/50 hover:bg-surface-soft focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        className,
      )}
      href={koFiUrl}
      rel="noopener noreferrer"
      target="_blank"
    >
      <HeartHandshake className="size-4 text-memory" />
      {label}
    </a>
  );
}
