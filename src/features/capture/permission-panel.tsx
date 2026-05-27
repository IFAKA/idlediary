"use client";

import { Camera, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CameraPermissionState } from "./permissions";

type PermissionPanelProps = {
  permission: CameraPermissionState;
  error?: string;
  onStart: () => void;
};

export function PermissionPanel({ permission, error, onStart }: PermissionPanelProps) {
  const denied = permission === "denied";

  return (
    <div className="relative z-10 flex min-h-[100svh] flex-col justify-end safe-screen">
      <div className="mb-8 max-w-sm">
        <div className="mb-5 inline-flex size-12 items-center justify-center rounded-full bg-white/10 text-primary">
          {denied ? <ShieldAlert className="size-6" /> : <Camera className="size-6" />}
        </div>
        <h1 className="text-4xl font-semibold leading-tight text-balance">IdleDiary</h1>
        <p className="mt-3 text-base leading-7 text-muted-foreground">
          Tap once, save two seconds, keep moving. Camera and microphone stay local unless you export.
        </p>
        {error ? (
          <p className="mt-4 rounded-md border border-destructive/45 bg-destructive/10 p-3 text-sm leading-6 text-destructive-foreground">
            {error}
          </p>
        ) : null}
      </div>
      <Button className="h-14 w-full text-base" type="button" onClick={onStart}>
        <Camera className="size-5" />
        {denied ? "Retry Access" : "Start recording"}
      </Button>
    </div>
  );
}
