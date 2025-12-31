"use client";

import {
  CallControls,
  CallParticipantsList,
  CallStatsButton,
  CallingState,
  PaginatedGridLayout,
  SpeakerLayout,
  useCall,
  useCallStateHooks,
} from "@stream-io/video-react-sdk";
import { ClosedCaption, LayoutList, Users } from "lucide-react";
import { useUser } from "@clerk/nextjs";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

import { EndCallButton } from "./end-call-button";
import { Loader } from "./loader";
import { TranscriptionOverlay } from "./transcription-overlay";

type CallLayoutType = "grid" | "speaker-left" | "speaker-right";

const controlButtonClasses =
  "flex size-11 items-center justify-center rounded-[5px] border border-white/10 bg-white/5 text-white transition hover:bg-white/15";

export const MeetingRoom = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showParticipants, setShowParticipants] = useState(false);
  const [layout, setLayout] = useState<CallLayoutType>("speaker-left");
  const [isCaptionsEnabled, setIsCaptionsEnabled] = useState(false);

  const call = useCall();
  const { isLoaded } = useUser();

  const { useCallCallingState, useLocalParticipant } = useCallStateHooks();
  const callingState = useCallCallingState();
  const localParticipant = useLocalParticipant();

  const toggleCaptions = async () => {
    if (!call) return;

    try {
      if (isCaptionsEnabled) {
        await call.stopClosedCaptions();
        setIsCaptionsEnabled(false);
      } else {
        // @ts-ignore - 'auto' is supported by Stream for language detection
        await call.startClosedCaptions({ language: "auto" });
        setIsCaptionsEnabled(true);
      }
    } catch (error) {
      console.error("Failed to toggle captions:", error);
    }
  };

  const isPersonalRoom = !!searchParams.get("personal");

  const CallLayout = () => {
    switch (layout) {
      case "grid":
        return <PaginatedGridLayout />;
      case "speaker-right":
        return <SpeakerLayout participantsBarPosition="left" />;
      default:
        return <SpeakerLayout participantsBarPosition="right" />;
    }
  };

  if (callingState !== CallingState.JOINED) return <Loader />;

  return (
    <div className="relative min-h-screen w-full overflow-hidden text-white">
      <div className="relative flex size-full items-center justify-center px-4 pb-28 pt-4">
        <div className="flex size-full items-center">
          <CallLayout />
        </div>

        <div
          className={cn("ml-2 hidden h-[calc(100vh_-_120px)]", {
            "show-block": showParticipants,
          })}
        >
          <CallParticipantsList onClose={() => setShowParticipants(false)} />
        </div>
      </div>

      {isCaptionsEnabled && <TranscriptionOverlay />}

      <div className="fixed bottom-0 left-0 right-0 z-50 flex w-full flex-wrap items-center justify-center gap-2 border-t border-white/10 bg-black/80 px-3 py-3 backdrop-blur-md">
        <CallControls onLeave={() => router.push("/")} />

        <DropdownMenu>
          <DropdownMenuTrigger
            className={cn(controlButtonClasses, "cursor-pointer")}
            title="Call layout"
          >
            <LayoutList size={20} className="text-white" />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="border-white/10 bg-black/90 text-white">
            {["Grid", "Speaker Left", "Speaker Right"].map((item, i) => (
              <div key={item + "-" + i}>
                <DropdownMenuItem
                  className="cursor-pointer"
                  onClick={() =>
                    setLayout(
                      item.toLowerCase().replace(" ", "-") as CallLayoutType
                    )
                  }
                >
                  {item}
                </DropdownMenuItem>

                <DropdownMenuSeparator className="border-white/10" />
              </div>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <button
          onClick={toggleCaptions}
          title={isCaptionsEnabled ? "Disable Captions" : "Enable Captions"}
          className={cn(
            controlButtonClasses,
            "relative",
            isCaptionsEnabled && "bg-emerald-500/20 text-emerald-400 border-emerald-500/50"
          )}
        >
          <ClosedCaption size={20} />
          {isCaptionsEnabled && (
            <span className="absolute -right-1 -top-1 flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500"></span>
            </span>
          )}
        </button>

        <CallStatsButton />

        <button
          onClick={() =>
            setShowParticipants((prevShowParticipants) => !prevShowParticipants)
          }
          title="Show participants"
        >
          <div className={cn(controlButtonClasses, "cursor-pointer")}>
            <Users size={20} className="text-white" />
          </div>
        </button>

        {!isPersonalRoom && <EndCallButton />}
      </div>
    </div>
  );
};
