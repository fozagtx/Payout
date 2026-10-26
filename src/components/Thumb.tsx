"use client";

import { useState } from "react";
import { BagIcon } from "./Icons.js";

/** Product thumbnail with a graceful placeholder when the image is missing or broken. */
export function Thumb({ src, alt, className = "h-10 w-10" }: { src?: string | null; alt: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className={`${className} shrink-0 overflow-hidden rounded-lg border border-line bg-cream`}>
      {src && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt} loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover" onError={() => setFailed(true)} />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-muted">
          <BagIcon className="h-4 w-4" />
        </div>
      )}
    </div>
  );
}
