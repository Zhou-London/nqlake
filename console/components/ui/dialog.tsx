"use client";

import { Description, Modal } from "@heroui/react";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export const Dialog = Modal.Backdrop;
export const DialogHeader = Modal.Header;
export const DialogTitle = Modal.Heading;
export const DialogDescription = Description;

export function DialogContent({
  className,
  children,
  ...props
}: Omit<ComponentProps<typeof Modal.Dialog>, "children"> & {
  children: React.ReactNode;
}) {
  return (
    <Modal.Container size="lg" placement="center" scroll="outside">
      <Modal.Dialog
        className={cn(
          "relative flex max-h-[90dvh] flex-col gap-4 overflow-y-auto p-6 sm:max-w-lg",
          typeof className === "string" && className,
        )}
        {...props}
      >
        <Modal.CloseTrigger aria-label="Close dialog" />
        {children}
      </Modal.Dialog>
    </Modal.Container>
  );
}
