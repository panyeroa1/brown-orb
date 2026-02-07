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
  LayoutList,
  Users,
  MessageSquare,
  Monitor,
  Radio,
  Smile,
  Mic,
  MicOff,
  Video,
  VideoOff,
  ChevronDown,
  Copy,
  Languages,
  Check,
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

const controlButtonClasses =
  "flex flex-col items-center justify-center gap-1 min-w-[64px] h-[52px] rounded-md transition-colors hover:bg-white/10 text-white/90";

const activeControlButtonClasses =
  "text-[#2D8CFF]";

const dangerControlButtonClasses =
  "text-[#F04B4B] hover:bg-[#F04B4B]/10";

export const MeetingRoom = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showParticipants, setShowParticipants] = useState(false);
  const [layout, setLayout] = useState<CallLayoutType>("speaker-left");
  const [sbUserId, setSbUserId] = useState<string | null>(null);
  const [muteOriginalAudio, setMuteOriginalAudio] = useState(false);
  const [translationLanguage, setTranslationLanguage] = useState<string>("off");
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
  const deepgram = useDeepgramSTT({ language: "en", model: "nova-2" });

  // Automatic Deepgram STT trigger based on Microphone state
  useEffect(() => {
    if (!isMute) {
      if (!deepgram.isListening) {
        console.log("[MeetingRoom] Mic unmuted, starting Deepgram STT...");
        deepgram.start().catch((err) => console.error("Auto-start Deepgram failed:", err));
      }
    } else if (isMute && deepgram.isListening) {
      console.log("[MeetingRoom] Mic muted, stopping Deepgram STT...");
      deepgram.stop();
    }
  }, [isMute, deepgram]);

  // Determine if any caption system is active
  const isCaptionsActive = deepgram.isListening || isStreamCaptionsEnabled || webSpeech.isListening;

  const toggleCaptions = async () => {
    if (!call) return;

    try {
      if (deepgram.isListening) {
        deepgram.stop();
        console.log("Deepgram stopped");
      } else {
        await deepgram.start();
        console.log("Deepgram started");
      }
    } catch (error) {
      console.error("Failed to toggle captions:", error);
    }
  };

  const isPersonalRoom = !!searchParams.get("personal");

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
        customTranscript={customTranscript}
        translationLanguage={translationLanguage}
        setTranslationLanguage={setTranslationLanguage}
        sourceLanguage={sourceLanguage}
        setSourceLanguage={setSourceLanguage}
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
  customTranscript,
  translationLanguage,
  setTranslationLanguage,
  sourceLanguage,
  setSourceLanguage,
}: any) => {
  const call = useCall();
  const { user } = useUser();
  const { toast } = useToast();
  const { useMicrophoneState, useCameraState, useScreenShareState } = useCallStateHooks();
  const { isMute, microphone, devices: micDevices, selectedDevice: selectedMicId } = useMicrophoneState();
  const { isEnabled: isVideoEnabled, camera, devices: camDevices, selectedDevice: selectedCamId } = useCameraState();
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
        <div className={cn("flex size-full items-center", showParticipants ? "w-[calc(100%-300px)]" : "w-full")}>
          <CallLayout />
        </div>

        {showParticipants && (
          <div className="h-[calc(100vh-80px)] w-[300px] border-l border-white/10 bg-black/40 backdrop-blur-md overflow-hidden">
            <CallParticipantsList onClose={() => setShowParticipants(false)} />
          </div>
        )}
      </div>

      <TranscriptionOverlay
        sttProvider="deepgram"
        customTranscript={customTranscript}
        userId={user?.id}
        targetLanguage={translationLanguage}
        meetingId={call?.id || ""}
        sbUserId={effectiveUserId}
      />

      <div className="fixed bottom-0 left-0 right-0 z-50 flex h-20 w-full items-center justify-between bg-[#1A1A1A] px-4">
        {/* Left Section: Audio, Video & Translation */}
        <div className="flex items-center gap-1 sm:gap-4">
          <div className="flex items-center">
            <button
              onClick={() => microphone.toggle()}
              className={cn(controlButtonClasses, isMute && dangerControlButtonClasses)}
            >
              {isMute ? <MicOff size={22} strokeWidth={1.5} /> : <Mic size={22} strokeWidth={1.5} />}
              <span className="text-[11px] font-medium leading-none">
                {isMute ? "Unmute" : "Mute"}
              </span>
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger className="h-[52px] w-4 hover:bg-white/10 flex items-center justify-center rounded-r-md">
                <ChevronDown size={14} className="text-white/50" />
              </DropdownMenuTrigger>
              <DropdownMenuContent className="border-white/10 bg-[#1A1A1A] text-white/90 max-h-[300px] overflow-y-auto w-64">
                <div className="px-2 py-1.5 text-xs font-semibold text-white/50">Microphone</div>
                {micDevices?.map((device) => (
                  <DropdownMenuItem
                    key={device.deviceId}
                    className={cn("cursor-pointer hover:bg-white/10", selectedMicId === device.deviceId && "bg-white/5 text-[#2D8CFF]")}
                    onClick={() => microphone.select(device.deviceId)}
                  >
                    <div className="flex w-full items-center justify-between">
                      <span className="truncate pr-2">{device.label || `Microphone ${device.deviceId.slice(0, 5)}`}</span>
                      {selectedMicId === device.deviceId && <Check size={14} />}
                    </div>
                  </DropdownMenuItem>
                ))}

                <DropdownMenuSeparator className="border-white/10" />
                <DropdownMenuItem
                  className="cursor-pointer hover:bg-white/10 text-xs text-white/50"
                  onClick={() => window.open('https://eburon.ai/support', '_blank')}
                >
                  Audio Settings...
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="flex items-center">
            <button
              onClick={() => camera.toggle()}
              className={cn(controlButtonClasses, !isVideoEnabled && dangerControlButtonClasses)}
            >
              {isVideoEnabled ? <Video size={22} strokeWidth={1.5} /> : <VideoOff size={22} strokeWidth={1.5} />}
              <span className="text-[11px] font-medium leading-none">
                {isVideoEnabled ? "Stop Video" : "Start Video"}
              </span>
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger className="h-[52px] w-4 hover:bg-white/10 flex items-center justify-center rounded-r-md">
                <ChevronDown size={14} className="text-white/50" />
              </DropdownMenuTrigger>
              <DropdownMenuContent className="border-white/10 bg-[#1A1A1A] text-white/90 max-h-[300px] overflow-y-auto w-64">
                <div className="px-2 py-1.5 text-xs font-semibold text-white/50">Camera</div>
                {camDevices?.map((device) => (
                  <DropdownMenuItem
                    key={device.deviceId}
                    className={cn("cursor-pointer hover:bg-white/10", selectedCamId === device.deviceId && "bg-white/5 text-[#2D8CFF]")}
                    onClick={() => camera.select(device.deviceId)}
                  >
                    <div className="flex w-full items-center justify-between">
                      <span className="truncate pr-2">{device.label || `Camera ${device.deviceId.slice(0, 5)}`}</span>
                      {selectedCamId === device.deviceId && <Check size={14} />}
                    </div>
                  </DropdownMenuItem>
                ))}

                <DropdownMenuSeparator className="border-white/10" />
                <DropdownMenuItem
                  className="cursor-pointer hover:bg-white/10 text-xs text-white/50"
                  onClick={() => window.open('https://eburon.ai/support', '_blank')}
                >
                  Video Settings...
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="flex items-center">
            <DropdownMenu>
              <DropdownMenuTrigger
                className={cn(
                  controlButtonClasses,
                  isTranslationEnabled && activeControlButtonClasses,
                  "px-2"
                )}
              >
                <Languages size={22} strokeWidth={1.5} />
                <span className="text-[11px] font-medium leading-none">Translation</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="border-white/10 bg-[#1A1A1A] text-white/90 max-h-[400px] overflow-y-auto w-64 px-1">
                <div className="px-2 py-2 text-xs font-bold text-[#2D8CFF] uppercase tracking-tighter">Translation Settings</div>

                <DropdownMenuItem
                  className="cursor-pointer hover:bg-white/10 mb-1 rounded-md py-2"
                  onClick={() => setIsTranslationEnabled(!isTranslationEnabled)}
                >
                  <div className="flex w-full items-center justify-between font-medium">
                    <span>Enable Translation</span>
                    <div className={cn(
                      "w-8 h-4 rounded-full transition-colors relative",
                      isTranslationEnabled ? "bg-[#2D8CFF]" : "bg-white/20"
                    )}>
                      <div className={cn(
                        "absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all",
                        isTranslationEnabled ? "right-0.5" : "left-0.5"
                      )} />
                    </div>
                  </div>
                </DropdownMenuItem>

                <DropdownMenuSeparator className="bg-white/5 mx-2" />

                <div className="px-2 pt-3 pb-1 text-[10px] font-bold text-white/40 uppercase tracking-widest">Speaking Language</div>
                {SPEAKER_LANGUAGES.map((lang) => (
                  <DropdownMenuItem
                    key={lang.value}
                    className={cn("cursor-pointer hover:bg-white/10 rounded-md py-1.5", sourceLanguage === lang.value && "bg-[#2D8CFF]/10 text-[#2D8CFF]")}
                    onClick={() => setSourceLanguage(lang.value)}
                  >
                    <div className="flex w-full items-center justify-between">
                      <span className="text-sm">{lang.label}</span>
                      {sourceLanguage === lang.value && <Check size={14} />}
                    </div>
                  </DropdownMenuItem>
                ))}

                <DropdownMenuSeparator className="bg-white/5 mx-2 my-2" />

                <div className="px-2 pt-1 pb-1 text-[10px] font-bold text-white/40 uppercase tracking-widest">Target Language (TTS)</div>
                <DropdownMenuItem
                  className={cn("cursor-pointer hover:bg-white/10 rounded-md py-1.5", translationLanguage === "off" && "bg-white/10 text-white/60")}
                  onClick={() => {
                    setTranslationLanguage("off");
                    setIsTranslationEnabled(false);
                  }}
                >
                  <div className="flex w-full items-center justify-between">
                    <span className="text-sm italic text-white/60">Audio Only (No Translation)</span>
                    {translationLanguage === "off" && <Check size={14} />}
                  </div>
                </DropdownMenuItem>
                {TARGET_LANGUAGES.map((lang) => (
                  <DropdownMenuItem
                    key={lang.value}
                    className={cn("cursor-pointer hover:bg-white/10 rounded-md py-1.5", translationLanguage === lang.value && "bg-[#2D8CFF]/10 text-[#2D8CFF]")}
                    onClick={() => {
                      setTranslationLanguage(lang.value);
                      if (lang.value !== "off") setIsTranslationEnabled(true);
                    }}
                  >
                    <div className="flex w-full items-center justify-between">
                      <span className="text-sm">{lang.label}</span>
                      {translationLanguage === lang.value && <Check size={14} />}
                    </div>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Center Section: Main Controls */}
        <div className="flex items-center gap-1 sm:gap-2">
          <button
            onClick={() => setShowParticipants(!showParticipants)}
            className={cn(controlButtonClasses, showParticipants && activeControlButtonClasses)}
          >
            <Users size={22} strokeWidth={1.5} />
            <span className="text-[11px] font-medium leading-none">Participants</span>
          </button>

          <button className={controlButtonClasses}>
            <MessageSquare size={22} strokeWidth={1.5} />
            <span className="text-[11px] font-medium leading-none">Chat</span>
          </button>

          <button
            onClick={() => screenShare.toggle()}
            className={cn(controlButtonClasses, isScreenSharing && activeControlButtonClasses)}
          >
            <Monitor size={22} strokeWidth={1.5} />
            <span className="text-[11px] font-medium leading-none">
              {isScreenSharing ? "Stop Share" : "Share Screen"}
            </span>
          </button>

          <button className={controlButtonClasses}>
            <Radio size={22} strokeWidth={1.5} />
            <span className="text-[11px] font-medium leading-none">Record</span>
          </button>

          <button className={controlButtonClasses}>
            <Smile size={22} strokeWidth={1.5} />
            <span className="text-[11px] font-medium leading-none">Reactions</span>
          </button>

          <DropdownMenu>
            <DropdownMenuTrigger className={controlButtonClasses}>
              <LayoutList size={22} strokeWidth={1.5} />
              <span className="text-[11px] font-medium leading-none">View</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="border-white/10 bg-[#1A1A1A] text-white/90">
              <DropdownMenuItem className="cursor-pointer hover:bg-white/10" onClick={() => setLayout("grid")}>
                Grid
              </DropdownMenuItem>
              <DropdownMenuItem
                className="cursor-pointer hover:bg-white/10"
                onClick={() => setLayout("speaker-left")}
              >
                Speaker View
              </DropdownMenuItem>
              <DropdownMenuItem className="cursor-pointer hover:bg-white/10" onClick={() => setLayout("gallery")}>
                Gallery
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Right Section: Invite & Meta */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => {
              navigator.clipboard.writeText(window.location.href);
              toast({ title: "Link Copied", description: "Meeting link copied to clipboard." });
            }}
            className={controlButtonClasses}
            title="Invite Others"
          >
            <Copy size={22} strokeWidth={1.5} />
            <span className="text-[11px] font-medium leading-none">Invite</span>
          </button>
          <CallStatsButton />
          <EndCallButton />
        </div>
      </div>
    </div>
  );
};
