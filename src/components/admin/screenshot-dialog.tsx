"use client";

import Image from "next/image";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function ScreenshotDialog({
  url,
  caption,
  open,
  onOpenChange,
}: {
  url: string | null;
  caption?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Review screenshot</DialogTitle>
          <DialogDescription>
            {caption ?? "Full-size proof of the published review."}
          </DialogDescription>
        </DialogHeader>
        {url ? (
          <Image
            src={url}
            alt="Review screenshot"
            width={1200}
            height={800}
            unoptimized
            className="max-h-[70vh] w-full rounded-lg object-contain"
          />
        ) : (
          <div className="flex h-48 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
            No screenshot available
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
