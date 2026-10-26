"use client";

import { Dialog as DialogPrimitive } from "radix-ui";
import type { ComponentProps } from "react";

export const Dialog = DialogPrimitive.Root;

export function DialogContent({ className = "", children, ...props }: ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/30" />
      <DialogPrimitive.Content
        className={`fixed left-1/2 top-1/2 z-50 grid max-h-[calc(100vh-2rem)] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto rounded-2xl border border-line bg-[#fbf9f3] p-5 text-ink shadow-xl outline-none sm:p-6 ${className}`}
        {...props}
      >
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogTitle({ className = "", ...props }: ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title className={`text-lg font-semibold tracking-tight text-ink ${className}`} {...props} />;
}

export function DialogDescription({ className = "", ...props }: ComponentProps<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description className={`text-sm leading-6 text-ink-soft ${className}`} {...props} />;
}

export function DialogFooter({ className = "", ...props }: ComponentProps<"div">) {
  return <div className={`flex flex-col-reverse gap-2 sm:flex-row sm:justify-end ${className}`} {...props} />;
}
