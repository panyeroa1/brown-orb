"use client";

import { useCallStateHooks } from "@stream-io/video-react-sdk";
import { useEffect, useState, useRef, useCallback } from "react";
import { saveTranscription } from "@/lib/transcription-service";
import { getTranslation, saveTranslation } from "@/lib/translate-service";

import { signInAnonymously } from "@/lib/supabase";

interface CaptionLine {
  id: string;
  speaker: string;
  speakerId: string;
  text: string;
  translatedText?: string;
  timestamp: number;
}

interface CustomTranscript {
  text: string;
  speaker: string;
  timestamp: number;
  isFinal: boolean;
}

interface TranscriptionOverlayProps {
  sttProvider: "stream" | "webspeech" | "deepgram";
  customTranscript: CustomTranscript | null;
  userId?: string;
  targetLanguage?: string;
  meetingId: string;
  sbUserId?: string | null;
}

const CAPTION_DISPLAY_DURATION = 5000;
const MAX_VISIBLE_LINES = 2;

export const TranscriptionOverlay = ({
  sttProvider,
  customTranscript,
  userId,
  targetLanguage = "off",
  meetingId,
  sbUserId: propSbUserId,
}: TranscriptionOverlayProps) => {
  const { useCallClosedCaptions } = useCallStateHooks();
  // const call = useCall(); // Removed redundant call
  const streamCaptions = useCallClosedCaptions();
  const [lines, setLines] = useState<CaptionLine[]>([]);
  const [internalSbUserId, setInternalSbUserId] = useState<string | null>(null);
  
  // Use prop if available, otherwise internal state
  const sbUserId = propSbUserId || internalSbUserId;

  const lastCaptionRef = useRef<string>("");
  const savedIdsRef = useRef<Set<string>>(new Set());

  const roomName = meetingId || "unknown"; // Use prop

  // Initialize anonymous auth on mount (Only if prop is missing, or as fallback)
  useEffect(() => {
    if (propSbUserId) return; // Skip if provided by parent

    let mounted = true;
    signInAnonymously().then(({ success, user }) => {
      if (mounted && success && user) {
        console.log(`[TranscriptionOverlay] Authenticated with id: ${user.id} (Meeting: ${meetingId})`);
        setInternalSbUserId(user.id);
      } else if (mounted) {
        console.warn("[TranscriptionOverlay] Supabase auth failed (check credentials/internet).");
      }
    });
    return () => { mounted = false; };
  }, [meetingId, propSbUserId]);

  // Handle translation and saving (Strict: Fetch -> Translate -> Save)
  const processTranscriptionFlow = useCallback(
    async (line: CaptionLine) => {
      if (!sbUserId && !userId) {
        console.warn(`[TranscriptionOverlay] Waiting for auth ID... (Meeting: ${meetingId})`);
        setTimeout(() => processTranscriptionFlow(line), 1000);
        return;
      }

      console.log(`[TranscriptionOverlay] Flow START: "${line.text}" | Meeting: ${meetingId} | Lang: ${targetLanguage} | ID: ${sbUserId || userId}`);
      console.log(`[TranscriptionOverlay] Flow START: "${line.text}" | Meeting: ${meetingId} | Lang: ${targetLanguage} | ID: ${sbUserId || userId}`);
      const originalText = line.text;

      // New Architecture: Listeners define their own translation.
      // We ONLY save the transcription (source text) here.
      // Translation happens client-side for the TTS listener.

      // Save as regular transcription
      await saveTranscription({
        user_id: userId || line.speakerId || "anonymous",
        room_name: roomName,
        sender: line.speaker,
        text: originalText,
      });
    },
    [roomName, meetingId, userId, sbUserId, targetLanguage]
  );

  // Trigger flow
  const saveToSupabase = useCallback(
    async (line: CaptionLine) => {
      if (savedIdsRef.current.has(line.id)) return;
      savedIdsRef.current.add(line.id);

      processTranscriptionFlow(line);
    },
    [processTranscriptionFlow]
  );

  // Handle Stream captions
  useEffect(() => {
    if (sttProvider !== "stream" || streamCaptions.length === 0) return;

    // Process all captions that haven't been saved yet
    streamCaptions.forEach((caption) => {
      const captionKey = `${caption.user?.id}-${caption.start_time}`;
      
      // If we haven't seen this specific caption start before, or if it has updated significantly
      if (!savedIdsRef.current.has(captionKey)) {
        const newLine: CaptionLine = {
          id: captionKey,
          speaker: caption.user?.name || caption.user?.id || "Speaker",
          speakerId: caption.user?.id || "unknown",
          text: caption.text,
          timestamp: Date.now(),
        };

        saveToSupabase(newLine);

        setLines((prev) => {
          const existingIndex = prev.findIndex(
            (line) =>
              line.speaker === newLine.speaker &&
              Date.now() - line.timestamp < 2000
          );

          if (existingIndex !== -1) {
            const updated = [...prev];
            updated[existingIndex] = { ...newLine, timestamp: Date.now() };
            return updated.slice(-MAX_VISIBLE_LINES);
          }

          return [...prev, newLine].slice(-MAX_VISIBLE_LINES);
        });
      }
    });
  }, [streamCaptions, sttProvider, saveToSupabase]);

  // Handle custom transcripts (Web Speech / Deepgram)
  useEffect(() => {
    if (sttProvider === "stream" || !customTranscript) return;

    const newLine: CaptionLine = {
      id: `custom-${customTranscript.timestamp}`,
      speaker: customTranscript.speaker,
      speakerId: userId || "local",
      text: customTranscript.text,
      timestamp: Date.now(),
    };

    if (customTranscript.isFinal) {
      saveToSupabase(newLine);
    }

    setLines((prev) => {
      const existingIndex = prev.findIndex(
        (line) =>
          line.speaker === newLine.speaker &&
          Date.now() - line.timestamp < 2000
      );

      if (existingIndex !== -1) {
        const updated = [...prev];
        updated[existingIndex] = { ...newLine, timestamp: Date.now() };
        return updated.slice(-MAX_VISIBLE_LINES);
      }

      return [...prev, newLine].slice(-MAX_VISIBLE_LINES);
    });
  }, [customTranscript, sttProvider, userId, saveToSupabase]);

  // Auto-remove old captions
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setLines((prev) =>
        prev.filter((line) => now - line.timestamp < CAPTION_DISPLAY_DURATION)
      );
    }, 500);

    return () => clearInterval(interval);
  }, []);

  if (lines.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-32 left-0 right-0 z-40 flex flex-col items-center gap-1 px-8">
      {lines.map((line) => {
        const age = Date.now() - line.timestamp;
        const opacity =
          age > CAPTION_DISPLAY_DURATION - 1000
            ? Math.max(0, 1 - (age - (CAPTION_DISPLAY_DURATION - 1000)) / 1000)
            : 1;

        return (
          <div
            key={line.id}
            className="caption-line flex w-full max-w-4xl flex-col items-start overflow-hidden transition-opacity duration-300"
            data-opacity={Math.round(opacity * 10) / 10}
          >
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-normal uppercase tracking-wider text-white/50 md:text-xs">
                {line.speaker}
              </span>
              <p className="text-left text-sm font-light tracking-wide text-white [text-shadow:_1px_1px_3px_rgba(0,0,0,1),_0_0_2px_rgba(0,0,0,1)] md:text-base">
                <span className="animate-typewriter">{line.text}</span>
              </p>
            </div>

          </div>
        );
      })}
    </div>
  );
};
