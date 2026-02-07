"use client";

import {
  CallParticipantsList,
  CallStatsButton,
  CallingState,
  PaginatedGridLayout,
  SpeakerLayout,
  useCall,
  useCallStateHooks,
} from "@stream-io/video-react-sdk";
import {
  ClosedCaption,
  LayoutList,
  Users,
  ChevronDown,
  VolumeX,
  Volume2,
  Mic,
  MicOff,
  Video,
  VideoOff,
  Monitor,
  UserPlus,
  Check
} from "lucide-react";
import { signInAnonymously } from "@/lib/supabase";
import { useUser } from "@clerk/nextjs";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect } from "react";
import { useToast } from "@/components/ui/use-toast";
import { SPEAKER_LANGUAGES, TARGET_LANGUAGES } from "@/constants/languages";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useWebSpeechSTT } from "@/hooks/use-web-speech-stt";
import { useDeepgramSTT } from "@/hooks/use-deepgram-stt";

import { EndCallButton } from "./end-call-button";
import { Loader } from "./loader";
import { TranscriptionOverlay } from "./transcription-overlay";
import { TTSProvider, useTTS } from "./tts-provider";

type CallLayoutType = "grid" | "speaker-left" | "speaker-right" | "gallery";
type STTProvider = "stream" | "webspeech" | "deepgram";

const controlButtonClasses =
  "flex size-11 items-center justify-center rounded-[5px] border border-white/10 bg-white/5 text-white transition hover:bg-white/15";

const STT_PROVIDER_LABELS: Record<STTProvider, string> = {
  stream: "Stream",
  webspeech: "Browser",
  deepgram: "Deepgram",
};

export const MeetingRoom = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showParticipants, setShowParticipants] = useState(false);
  const [layout, setLayout] = useState<CallLayoutType>("speaker-left");
  const [sttProvider, setSTTProvider] = useState<STTProvider>("stream");
  const [translationLanguage, setTranslationLanguage] = useState<string>("off");
  const [sbUserId, setSbUserId] = useState<string | null>(null);
  const [muteOriginalAudio, setMuteOriginalAudio] = useState(false);

  const [sourceLanguage, setSourceLanguage] = useState<string>("en");

  // Effect to mute/unmute all remote participant audio elements
  useEffect(() => {
    let rafId: number | null = null;
    let isScheduled = false;

    const muteRemoteAudio = () => {
      // Cancel any pending updates
      isScheduled = false;

      // Find all video/audio elements in the call container and mute them
      const mediaElements = document.querySelectorAll<HTMLVideoElement | HTMLAudioElement>(
        '[data-testid="participant-view"] video, [data-testid="participant-view"] audio, .str-video__participant-view video, .str-video__participant-view audio'
      );

      mediaElements.forEach((el) => {
        // Only mute remote participants, not local
        const isLocal = el.closest('[data-testid="local-participant"]') ||
          el.closest('.str-video__participant-view--local');
        if (!isLocal) {
          el.muted = muteOriginalAudio;
        }
      });
    };

    // Throttled version using requestAnimationFrame
    const scheduleMuteUpdate = () => {
      if (!isScheduled) {
        isScheduled = true;
        rafId = requestAnimationFrame(muteRemoteAudio);
      }
    };

    // Run immediately on mount or when toggle changes
    muteRemoteAudio();

    // Set up a MutationObserver with throttling to catch dynamically added elements
    const observer = new MutationObserver(scheduleMuteUpdate);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: false, // Don't observe attribute changes to reduce noise
    });

    return () => {
      observer.disconnect();
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
    };
  }, [muteOriginalAudio]);

  // Initialize early anonymous auth
  useEffect(() => {
    signInAnonymously().then(({ success, user }) => {
      if (success && user) {
        console.log("[MeetingRoom] Pre-authenticated anonymously to Supabase:", user.id);
        setSbUserId(user.id);
      }
    });
  }, []);

  const [customTranscript, setCustomTranscript] = useState<{
    text: string;
    speaker: string;
    timestamp: number;
    isFinal: boolean;
  } | null>(null);

  const call = useCall();
  const { user } = useUser();

  const {
    useCallCallingState,
    useIsCallCaptioningInProgress,
    useLocalParticipant,
    useMicrophoneState,
    useCameraState,
    useScreenShareState,
  } = useCallStateHooks();
  const callingState = useCallCallingState();
  const localParticipant = useLocalParticipant();
  const isStreamCaptionsEnabled = useIsCallCaptioningInProgress();
  const { isMute, microphone } = useMicrophoneState();
  const { isEnabled: isVideoEnabled, camera } = useCameraState();
  const { isEnabled: isScreenSharing, screenShare } = useScreenShareState();
  const { toast } = useToast();

  // Web Speech API hook
  const webSpeech = useWebSpeechSTT({ language: "en-US", continuous: true });

  // Deepgram hook
  const deepgram = useDeepgramSTT({ language: sourceLanguage, model: "nova-2" });

  // Automatic Deepgram STT trigger based on Microphone state
  useEffect(() => {
    if (!isMute && sttProvider === "deepgram") {
      if (!deepgram.isListening) {
        console.log("[MeetingRoom] Mic unmuted, starting Deepgram STT...");
        deepgram.start().catch((err) => console.error("Auto-start Deepgram failed:", err));
      }
    } else if (isMute && deepgram.isListening) {
      console.log("[MeetingRoom] Mic muted, stopping Deepgram STT...");
      deepgram.stop();
    }
  }, [isMute, sttProvider, deepgram]);

  // Determine if any caption system is active
  const isCaptionsActive =
    sttProvider === "stream"
      ? isStreamCaptionsEnabled
      : sttProvider === "webspeech"
        ? webSpeech.isListening
        : deepgram.isListening;

  // Update custom transcript when Web Speech or Deepgram provides new text
  useEffect(() => {
    if (sttProvider === "webspeech" && webSpeech.transcript) {
      setCustomTranscript({
        text: webSpeech.transcript.text,
        speaker: user?.firstName || user?.username || "You",
        timestamp: webSpeech.transcript.timestamp,
        isFinal: webSpeech.transcript.isFinal,
      });
    }
  }, [webSpeech.transcript, sttProvider, user]);

  useEffect(() => {
    if (sttProvider === "deepgram" && deepgram.transcript) {
      setCustomTranscript({
        text: deepgram.transcript.text,
        speaker: user?.firstName || user?.username || "You",
        timestamp: deepgram.transcript.timestamp,
        isFinal: deepgram.transcript.isFinal,
      });
    }
  }, [deepgram.transcript, sttProvider, user]);

  const toggleCaptions = async () => {
    if (!call) return;

    try {
      if (sttProvider === "stream") {
        if (isStreamCaptionsEnabled) {
          await call.stopClosedCaptions();
          console.log("Stream captions stopped");
        } else {
          await call.startClosedCaptions();
          console.log("Stream captions started");
        }
      } else if (sttProvider === "webspeech") {
        if (webSpeech.isListening) {
          webSpeech.stop();
          console.log("Web Speech stopped");
        } else {
          webSpeech.start();
          console.log("Web Speech started");
        }
      } else if (sttProvider === "deepgram") {
        if (deepgram.isListening) {
          deepgram.stop();
          console.log("Deepgram stopped");
        } else {
          await deepgram.start();
          console.log("Deepgram started");
        }
      }
    } catch (error) {
      console.error("Failed to toggle captions:", error);
    }
  };

  const handleProviderChange = async (provider: STTProvider) => {
    // Stop current provider first
    if (sttProvider === "stream" && isStreamCaptionsEnabled) {
      try {
        await call?.stopClosedCaptions();
      } catch (e) {
        console.error(e);
      }
    } else if (sttProvider === "webspeech" && webSpeech.isListening) {
      webSpeech.stop();
    } else if (sttProvider === "deepgram" && deepgram.isListening) {
      deepgram.stop();
    }

    setSTTProvider(provider);
    setCustomTranscript(null);
  };

  const isPersonalRoom = !!searchParams.get("personal");

  const CallLayout = () => {
    switch (layout) {
      case "grid":
      case "gallery":
        return <PaginatedGridLayout />;
      case "speaker-right":
        return <SpeakerLayout participantsBarPosition="left" />;
      default:
        return <SpeakerLayout participantsBarPosition="right" />;
    }
  };

  if (callingState !== CallingState.JOINED) return <Loader />;

  const effectiveUserId = user?.id || sbUserId || "";

  return (
    <TTSProvider initialUserId={effectiveUserId} targetLanguage={translationLanguage} meetingId={call?.id || ""}>
      <MeetingRoomContent
        effectiveUserId={effectiveUserId}
        layout={layout}
        setLayout={setLayout}
        showParticipants={showParticipants}
        setShowParticipants={setShowParticipants}
        translationLanguage={translationLanguage}
        setTranslationLanguage={setTranslationLanguage}
        sourceLanguage={sourceLanguage}
        setSourceLanguage={setSourceLanguage}
        sttProvider={sttProvider}
        setSTTProvider={setSTTProvider}
        handleProviderChange={handleProviderChange}
        customTranscript={customTranscript}
        muteOriginalAudio={muteOriginalAudio}
        setMuteOriginalAudio={setMuteOriginalAudio}
        toggleCaptions={toggleCaptions}
        isCaptionsActive={isCaptionsActive}
        webSpeech={webSpeech}
        deepgram={deepgram}
      />
    </TTSProvider>
  );
};

// Internal component to consume useTTS hook
const MeetingRoomContent = ({
  effectiveUserId,
  layout,
  setLayout,
  showParticipants,
  setShowParticipants,
  translationLanguage,
  setTranslationLanguage,
  sourceLanguage,
  setSourceLanguage,
  sttProvider,
  setSTTProvider,
  handleProviderChange,
  customTranscript,
  muteOriginalAudio,
  setMuteOriginalAudio,
  toggleCaptions,
  isCaptionsActive
}: any) => {
  const call = useCall();
  const { user } = useUser();
  const { toast } = useToast();
  const { useMicrophoneState, useCameraState, useScreenShareState } = useCallStateHooks();
  const { isMute, microphone } = useMicrophoneState();
  const { isEnabled: isVideoEnabled, camera } = useCameraState();
  const { isEnabled: isScreenSharing, screenShare } = useScreenShareState();

  const { isTranslationEnabled, setIsTranslationEnabled } = useTTS();

  const CallLayout = () => {
    switch (layout) {
      case "grid":
      case "gallery":
        return <PaginatedGridLayout />;
      case "speaker-right":
        return <SpeakerLayout participantsBarPosition="left" />;
      default:
        return <SpeakerLayout participantsBarPosition="right" />;
    }
  };

  return (
    <div className="relative h-screen w-full overflow-hidden text-white">
      <div className="relative flex size-full items-center justify-center">
        <div className="flex size-full items-center">
          <CallLayout />
        </div>

        <div
          className={cn("ml-2 hidden h-full", {
            "show-block": showParticipants,
          })}
        >
          <CallParticipantsList onClose={() => setShowParticipants(false)} />
        </div>
      </div>

      <TranscriptionOverlay
        sttProvider={sttProvider}
        customTranscript={customTranscript}
        userId={user?.id}
        targetLanguage={translationLanguage}
        meetingId={call?.id || ""}
        sbUserId={effectiveUserId}
      />

      <div className="fixed bottom-0 left-0 right-0 z-50 flex w-full flex-wrap items-center justify-center gap-3 border-t border-white/10 bg-black/80 px-4 py-4 backdrop-blur-md">

        {/* 1. Speaker / Output Settings (Target Language + Mute Original) */}
        <div className="flex items-center">
          <button
            onClick={() => setMuteOriginalAudio(!muteOriginalAudio)}
            title={muteOriginalAudio ? "Unmute Original Audio" : "Mute Original Audio"}
            className={cn(
              controlButtonClasses,
              "relative rounded-r-none border-r-0",
              muteOriginalAudio ? "bg-red-500/20 text-red-400 border-red-500/50" : "hover:bg-white/10"
            )}
          >
            {muteOriginalAudio ? <VolumeX size={20} /> : <Volume2 size={20} />}
          </button>

          <DropdownMenu>
            <DropdownMenuTrigger
              className={cn(
                controlButtonClasses,
                "w-auto gap-1 rounded-l-none px-2 cursor-pointer",
                translationLanguage !== "off" && "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
              )}
              title="Target Language (TTS)"
            >
              <span className="text-[10px] font-bold uppercase">
                {translationLanguage === "off" ? "OFF" : translationLanguage}
              </span>
              <ChevronDown size={12} />
            </DropdownMenuTrigger>
            <DropdownMenuContent className="border-white/10 bg-black/90 text-white max-h-[300px] overflow-y-auto w-48">
              <DropdownMenuItem
                className="cursor-pointer"
                onClick={() => setMuteOriginalAudio(!muteOriginalAudio)}
              >
                <div className="flex w-full items-center justify-between">
                  <span>Mute Original Audio</span>
                  {muteOriginalAudio && <Check size={14} className="text-emerald-400" />}
                </div>
              </DropdownMenuItem>
              <DropdownMenuSeparator className="border-white/10" />
              <div className="px-2 py-1.5 text-xs font-semibold text-white/50">Target Language (TTS)</div>
              <DropdownMenuItem
                className={cn("cursor-pointer", translationLanguage === "off" && "bg-white/10 text-emerald-400")}
                onClick={() => setTranslationLanguage("off")}
              >
                <span>No Translation</span>
                {translationLanguage === "off" && <Check size={14} />}
              </DropdownMenuItem>

              {TARGET_LANGUAGES.map((lang) => (
                <DropdownMenuItem
                  key={lang.value}
                  className={cn("cursor-pointer", translationLanguage === lang.value && "bg-white/10 text-emerald-400")}
                  onClick={() => {
                    setTranslationLanguage(lang.value);
                    if (lang.value !== "off") setIsTranslationEnabled(true);
                  }}
                >
                  <div className="flex w-full items-center justify-between">
                    <span>{lang.label}</span>
                    {translationLanguage === lang.value && <Check size={14} />}
                  </div>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* 2. Mic / Input Settings (Source Language) */}
        <div className="flex items-center">
          <button
            onClick={() => microphone.toggle()}
            title={isMute ? "Unmute Microphone" : "Mute Microphone"}
            className={cn(
              controlButtonClasses,
              "relative rounded-r-none border-r-0",
              !isMute ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10" : "text-red-400 border-red-500/30 bg-red-500/10"
            )}
          >
            {isMute ? <MicOff size={20} /> : <Mic size={20} />}
          </button>

          <DropdownMenu>
            <DropdownMenuTrigger
              className={cn(
                controlButtonClasses,
                "w-auto gap-1 rounded-l-none px-2",
                !isMute ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10" : "text-red-400 border-red-500/30 bg-red-500/10"
              )}
              title="Select Source Language"
            >
              <span className="text-[10px] font-medium uppercase">
                {sourceLanguage}
              </span>
              <ChevronDown size={12} />
            </DropdownMenuTrigger>
            <DropdownMenuContent className="border-white/10 bg-black/90 text-white max-h-[300px] overflow-y-auto w-48">
              <div className="px-2 py-1.5 text-xs font-semibold text-white/50">Speaking Language</div>
              {SPEAKER_LANGUAGES.map((lang) => (
                <DropdownMenuItem
                  key={lang.value}
                  className={cn("cursor-pointer", sourceLanguage === lang.value && "bg-white/10 text-emerald-400")}
                  onClick={() => setSourceLanguage(lang.value)}
                >
                  <div className="flex w-full items-center justify-between">
                    <span>{lang.label}</span>
                    {sourceLanguage === lang.value && <Check size={14} />}
                  </div>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* 4. Video Toggle */}
        <button
          onClick={() => camera.toggle()}
          title={isVideoEnabled ? "Turn Off Camera" : "Turn On Camera"}
          className={cn(controlButtonClasses, isVideoEnabled ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10" : "text-red-400 border-red-500/30 bg-red-500/10")}
        >
          {isVideoEnabled ? <Video size={20} /> : <VideoOff size={20} />}
        </button>

        {/* 5. Screen Share Toggle */}
        <button
          onClick={() => screenShare.toggle()}
          title={isScreenSharing ? "Stop Sharing" : "Share Screen"}
          className={cn(controlButtonClasses, isScreenSharing && "text-blue-400 border-blue-500/50 bg-blue-500/20")}
        >
          <Monitor size={20} />
        </button>

        <div className="mx-2 h-8 w-px bg-white/10" />

        {/* 6. Invite Button */}
        <button
          onClick={() => {
            const link = `${window.location.origin}/meeting/${call?.id}`;
            navigator.clipboard.writeText(link);
            toast({ title: "Invite link copied!" });
          }}
          title="Invite Someone"
          className={cn(controlButtonClasses, "hover:text-emerald-400 hover:border-emerald-500/50")}
        >
          <UserPlus size={20} />
        </button>

        {/* 7. Layout Selector */}
        <DropdownMenu>
          <DropdownMenuTrigger
            className={cn(controlButtonClasses, "cursor-pointer")}
            title="Call layout"
          >
            <LayoutList size={20} className="text-white" />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="border-white/10 bg-black/90 text-white">
            {["Grid", "Speaker Left", "Speaker Right", "Gallery"].map((item, i) => (
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

        {/* 8. Caption Toggle */}
        <div className="flex items-center">
          <button
            onClick={toggleCaptions}
            title={isCaptionsActive ? "Disable Captions" : "Enable Captions"}
            className={cn(
              controlButtonClasses,
              "relative rounded-r-none border-r-0",
              isCaptionsActive &&
              "bg-emerald-500/20 text-emerald-400 border-emerald-500/50"
            )}
          >
            <ClosedCaption size={20} />
            {isCaptionsActive && (
              <span className="absolute -right-1 -top-1 flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500"></span>
              </span>
            )}
          </button>

          <DropdownMenu>
            <DropdownMenuTrigger
              className={cn(
                controlButtonClasses,
                "w-auto gap-1 rounded-l-none px-2",
                isCaptionsActive &&
                "bg-emerald-500/20 text-emerald-400 border-emerald-500/50"
              )}
              title="Select STT Provider"
            >
              <span className="text-[10px] font-medium">
                {STT_PROVIDER_LABELS[sttProvider]}
              </span>
              <ChevronDown size={12} />
            </DropdownMenuTrigger>
            <DropdownMenuContent className="border-white/10 bg-black/90 text-white">
              <DropdownMenuItem
                className={cn(
                  "cursor-pointer",
                  sttProvider === "stream" && "bg-white/10"
                )}
                onClick={() => handleProviderChange("stream")}
              >
                Stream (Built-in)
              </DropdownMenuItem>
              <DropdownMenuSeparator className="border-white/10" />
              <DropdownMenuItem
                className={cn(
                  "cursor-pointer",
                  sttProvider === "webspeech" && "bg-white/10"
                )}
                onClick={() => handleProviderChange("webspeech")}
              >
                Browser (Web Speech)
                {/* {!webSpeech.isSupported && (
                  <span className="ml-2 text-[10px] text-red-400">
                    Not Supported
                  </span>
                )} */}
              </DropdownMenuItem>
              <DropdownMenuSeparator className="border-white/10" />
              <DropdownMenuItem
                className={cn(
                  "cursor-pointer",
                  sttProvider === "deepgram" && "bg-white/10"
                )}
                onClick={() => handleProviderChange("deepgram")}
              >
                Deepgram (Cloud)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <CallStatsButton />

        {/* 9. Participants Toggle */}
        <button
          onClick={() =>
            setShowParticipants((prev: boolean) => !prev)
          }
          title="Show participants"
        >
          <div className={cn(controlButtonClasses, "cursor-pointer")}>
            <Users size={20} className="text-white" />
          </div>
        </button>

        {/* 10. End Call */}
        <EndCallButton />
      </div>
    </div>
  );
};
