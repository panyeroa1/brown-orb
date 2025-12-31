"use client";

import { useCallStateHooks } from "@stream-io/video-react-sdk";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export const TranscriptionOverlay = () => {
  const { useCallClosedCaptions } = useCallStateHooks();
  const captions = useCallClosedCaptions();
  const [visibleCaptions, setVisibleCaptions] = useState<typeof captions>([]);

  useEffect(() => {
    // Keep internal state of captions to manage animations if needed
    setVisibleCaptions(captions);
  }, [captions]);

  if (visibleCaptions.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-32 left-0 right-0 z-40 flex flex-col items-center gap-1 px-4 transition-all duration-300">
      {visibleCaptions.map((caption, index) => (
        <div
          key={`${caption.user?.id}-${caption.start_time}`}
          className={cn(
            "max-w-[85%] transform px-2 text-center transition-all duration-300",
            index === visibleCaptions.length - 1 ? "opacity-100 scale-100" : "opacity-20 scale-95"
          )}
        >
          <p className="text-xs font-light tracking-wide text-white [text-shadow:_1px_1px_2px_rgba(0,0,0,1),_0_0_1px_rgba(0,0,0,1)] md:text-sm">
            <span className="mr-1 inline-block text-[9px] font-normal uppercase opacity-40 md:text-[10px]">
              {caption.user?.name || caption.user?.id || "Speaker"}
            </span>
            {caption.text}
          </p>
        </div>
      ))}
    </div>
  );
};
