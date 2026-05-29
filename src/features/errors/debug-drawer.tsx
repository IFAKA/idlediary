"use client";

import { Bug, Clipboard } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useMediaQuery } from "@/hooks/use-media-query";
import { getDebugSnapshot, subscribeDebugStore } from "./debug-store";

export function DebugDrawer() {
  const [open, setOpen] = useState(false);
  const [snapshot, setSnapshot] = useState(getDebugSnapshot);
  const isDesktop = useMediaQuery("(min-width: 768px)");

  useEffect(() => {
    const unsubscribe = subscribeDebugStore(() => setSnapshot(getDebugSnapshot()));
    return () => {
      unsubscribe();
    };
  }, []);

  if (process.env.NODE_ENV === "production") {
    return null;
  }

  if (
    typeof window !== "undefined" &&
    window.sessionStorage.getItem("idleDiaryDebugDisabled") === "true"
  ) {
    return null;
  }

  const copyReport = async () => {
    await navigator.clipboard.writeText(JSON.stringify(snapshot, null, 2));
  };

  const content = (
    <>
      <Button type="button" variant="outline" onClick={copyReport}>
        <Clipboard className="size-4" />
        Copy JSON
      </Button>
      <div className="min-h-0 overflow-auto rounded-md border bg-black/20 p-3 text-xs leading-5 text-muted-foreground">
        <pre>{JSON.stringify(snapshot, null, 2)}</pre>
      </div>
    </>
  );

  return (
    <>
      <Button
        aria-label="Open debug report"
        className="app-debug-button fixed right-4 top-[max(16px,env(safe-area-inset-top))] z-40 rounded-full bg-black/45 backdrop-blur"
        size="icon"
        type="button"
        variant="ghost"
        onClick={() => setOpen(true)}
      >
        <Bug className="size-5" />
      </Button>
      {isDesktop ? (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-h-[82svh] overflow-hidden">
            <DialogHeader>
              <DialogTitle>Debug timeline</DialogTitle>
              <DialogDescription>
                Recent local events and structured errors for this session.
              </DialogDescription>
            </DialogHeader>
            {content}
          </DialogContent>
        </Dialog>
      ) : (
        <Drawer open={open} onOpenChange={setOpen}>
          <DrawerContent className="max-h-[88svh] px-4 pb-[max(16px,env(safe-area-inset-bottom))]">
            <DrawerHeader className="px-0 text-left">
              <DrawerTitle>Debug timeline</DrawerTitle>
              <DrawerDescription>
                Recent local events and structured errors for this session.
              </DrawerDescription>
            </DrawerHeader>
            <div className="grid min-h-0 flex-1 gap-3 pb-4">{content}</div>
          </DrawerContent>
        </Drawer>
      )}
    </>
  );
}
