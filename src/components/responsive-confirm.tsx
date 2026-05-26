"use client";

import { Button, type ButtonProps } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancelButton,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useMediaQuery } from "@/hooks/use-media-query";

type ResponsiveConfirmProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  cancelLabel?: string;
  actionLabel: string;
  actionVariant?: ButtonProps["variant"];
  onAction: () => void | Promise<void>;
  disabled?: boolean;
};

export function ResponsiveConfirm({
  open,
  onOpenChange,
  title,
  description,
  cancelLabel = "Cancel",
  actionLabel,
  actionVariant = "default",
  onAction,
  disabled = false,
}: ResponsiveConfirmProps) {
  const isDesktop = useMediaQuery("(min-width: 768px)");

  const runAction = async () => {
    await onAction();
  };

  if (isDesktop) {
    return (
      <AlertDialog open={open} onOpenChange={onOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            <AlertDialogDescription>{description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancelButton disabled={disabled} type="button">
              {cancelLabel}
            </AlertDialogCancelButton>
            <Button
              disabled={disabled}
              type="button"
              variant={actionVariant}
              onClick={runAction}
            >
              {actionLabel}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[88svh] px-4 pb-[max(16px,env(safe-area-inset-bottom))]">
        <DrawerHeader className="px-0 text-left">
          <DrawerTitle>{title}</DrawerTitle>
          <DrawerDescription className="leading-6">{description}</DrawerDescription>
        </DrawerHeader>
        <DrawerFooter className="px-0 pb-0 pt-2">
          <Button
            className="w-full"
            disabled={disabled}
            type="button"
            variant={actionVariant}
            onClick={runAction}
          >
            {actionLabel}
          </Button>
          <DrawerClose asChild>
            <Button className="w-full" disabled={disabled} type="button" variant="outline">
              {cancelLabel}
            </Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
