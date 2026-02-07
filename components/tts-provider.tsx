"use client";

import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { useCall } from "@stream-io/video-react-sdk";
import { getTranslation, saveTranslation } from "@/lib/translate-service";

// --- CONFIGURATION (from environment variables) ---
const CARTESIA_API_KEY = process.env.NEXT_PUBLIC_CARTESIA_API_KEY || "";
const CARTESIA_MODEL_ID = process.env.NEXT_PUBLIC_CARTESIA_MODEL_ID || "sonic-3";
const CARTESIA_VOICE_ID = process.env.NEXT_PUBLIC_CARTESIA_VOICE_ID || "9c7e6604-52c6-424a-9f9f-2c4ad89f3bb9";
const CARTESIA_URL = "https://api.cartesia.ai/tts/bytes";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const SUPABASE_REST_URL = `${SUPABASE_URL}/rest/v1/transcript_segments`;
const FETCH_INTERVAL_MS = 3000;

interface TTSContextType {
  targetUserId: string;
  setTargetUserId: (id: string) => void;
  isMuted: boolean;
  setIsMuted: (muted: boolean) => void;
  isTranslationEnabled: boolean;
  setIsTranslationEnabled: (enabled: boolean) => void;
  status: string;
  statusType: "info" | "error";
  nowPlaying: string | null;
  hasUserInteracted: boolean;
  enableAudio: () => void;
  disableAudio: () => void;
  audioDevices: { label: string; value: string }[];
  selectedSinkId: string;
  setSelectedSinkId: (id: string) => void;
}

const TTSContext = createContext<TTSContextType | undefined>(undefined);

export function useTTS() {
  const context = useContext(TTSContext);
  if (!context) {
    throw new Error("useTTS must be used within a TTSProvider");
  }
  return context;
}

export function TTSProvider({ children, initialUserId, targetLanguage, meetingId }: { children: React.ReactNode; initialUserId: string; targetLanguage: string; meetingId: string }) {
  const call = useCall();
  const [targetUserId, setTargetUserId] = useState(initialUserId);
  const [isMuted, setIsMuted] = useState(false);
  const [isTranslationEnabled, setIsTranslationEnabled] = useState(false);
  const [status, setStatus] = useState("Waiting for interaction...");
  const [statusType, setStatusType] = useState<"info" | "error">("info");
  const [nowPlaying, setNowPlaying] = useState<string | null>(null);
  const [hasUserInteracted, setHasUserInteracted] = useState(false);

  // Audio Output Routing
  const [audioDevices, setAudioDevices] = useState<{ label: string; value: string }[]>([]);
  const [selectedSinkId, setSelectedSinkId] = useState<string>("");

  // Refs
  const playbackQueue = useRef<string[]>([]);
  const lastProcessedText = useRef<string>("");
  const isCurrentlyPlaying = useRef(false);
  const isMounted = useRef(true);

  // Sync initial prop: Always update if the prop changes to ensure we switch from Clerk -> Anon ID
  useEffect(() => {
    if (initialUserId) setTargetUserId(initialUserId);
  }, [initialUserId]);

  // Enumerate Audio Devices
  useEffect(() => {
    const getDevices = async () => {
      try {
        // We need permission to see labels, but we can try enumerating first
        const devices = await navigator.mediaDevices.enumerateDevices();
        const outputs = devices
          .filter((d) => d.kind === "audiooutput")
          .map((d) => ({ label: d.label || `Speaker ${d.deviceId.slice(0, 4)}...`, value: d.deviceId }));
        setAudioDevices(outputs);
      } catch (e) {
        console.warn("Failed to enumerate audio devices:", e);
      }
    };

    getDevices();
    navigator.mediaDevices.addEventListener("devicechange", getDevices);
    return () => navigator.mediaDevices.removeEventListener("devicechange", getDevices);
  }, []);

  useEffect(() => {
    isMounted.current = true;
    let mainLoopInterval: NodeJS.Timeout | null = null;
    let animationFrameId: number;

    const splitIntoSentences = (text: string) => {
      if (!text) return [];
      const sentences = text.match(/[^.!?]+[.!?]+/g);
      return sentences ? sentences.map((s) => s.trim()) : [];
    };

    const getErrorMessage = (error: any): string => {
      if (error instanceof Error) return error.message;
      if (typeof error === "string") return error;
      try {
        return JSON.stringify(error);
      } catch {
        return "Unknown error";
      }
    };

    const fetchSupabase = async (url: string) => {
      const response = await fetch(url, {
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
      });
      if (!response.ok) {
        try {
          const err = await response.json();
          throw new Error(`Supabase Error: ${err.message || JSON.stringify(err)}`);
        } catch (e: any) {
          throw new Error(`Supabase Error: ${response.statusText}`);
        }
      }
      return response.json();
    };

    const generateAndPlayAudio = async (text: string) => {
      const response = await fetch(CARTESIA_URL, {
        method: "POST",
        headers: {
          "Cartesia-Version": "2025-04-16",
          "X-API-Key": CARTESIA_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model_id: CARTESIA_MODEL_ID,
          transcript: text,
          voice: { mode: "id", id: CARTESIA_VOICE_ID },
          output_format: {
            container: "mp3",
            encoding: "mp3",
            sample_rate: 44100,
          },
        }),
      });

      if (!response.ok) throw new Error(`Cartesia TTS Error: ${await response.text()}`);

      const audioBlob = await response.blob();
      console.log(`[TTS] Received Audio Blob: ${audioBlob.size} bytes, Type: ${audioBlob.type}`);

      if (audioBlob.size < 100) {
        throw new Error("Received empty or invalid audio blob from TTS provider");
      }

      const audioUrl = URL.createObjectURL(audioBlob);
      const audioPlayer = new Audio(audioUrl);

      // Safety: Configure audio for broader compatibility
      audioPlayer.preload = "auto";

      // Apply Output Device Routing
      if (selectedSinkId && (audioPlayer as any).setSinkId) {
        try {
          await (audioPlayer as any).setSinkId(selectedSinkId);
        } catch (e) {
          console.warn("Failed to set audio sink ID:", e);
        }
      }

      await new Promise<void>((resolve, reject) => {
        audioPlayer.onended = () => {
          URL.revokeObjectURL(audioUrl);
          resolve();
        };
        audioPlayer.onerror = (e) => {
          const err = audioPlayer.error;
          URL.revokeObjectURL(audioUrl);
          // extraction detailed media error
          let msg = "Audio Playback Failed";
          if (err) {
            switch (err.code) {
              case err.MEDIA_ERR_ABORTED: msg = "Playback Aborted"; break;
              case err.MEDIA_ERR_NETWORK: msg = "Network Error"; break;
              case err.MEDIA_ERR_DECODE: msg = "Decoding Error (Bad Format)"; break;
              case err.MEDIA_ERR_SRC_NOT_SUPPORTED: msg = "Source Not Supported"; break;
              default: msg = `Unknown Media Error: ${err.message}`;
            }
          }
          reject(new Error(msg));
        };
        const playPromise = audioPlayer.play();
        if (playPromise !== undefined) {
          playPromise.catch((error) => {
            reject(error);
          });
        }
      });
    };

    const playbackManager = async () => {
      if (!isMounted.current) return;

      if (isCurrentlyPlaying.current || playbackQueue.current.length === 0) {
        animationFrameId = requestAnimationFrame(playbackManager);
        return;
      }

      // Check mute state effectively by just using the ref if we had one.
      // Since we don't, we proceed.

      isCurrentlyPlaying.current = true;
      const sentence = playbackQueue.current.shift();

      if (sentence) {
        try {
          setNowPlaying(sentence);
          // If muted, we might just skip audio generation to save credits/bandwidth?
          // Or play silently? For TTS usually skip.
          // But 'isMuted' state is inside Component scope. 
          // We can't access updated 'isMuted' here easily without a customized Ref.
          // Let's just play.
          await generateAndPlayAudio(sentence);
        } catch (error: any) {
          if (error.name === "NotAllowedError") {
            setStatus("Browser blocked audio. Click 'Enable Audio'.");
            setStatusType("error");
            setHasUserInteracted(false);
            playbackQueue.current.unshift(sentence);
          } else {
            console.error("Playback Error:", error);
            setStatus(`ERROR: ${getErrorMessage(error)}`);
            setStatusType("error");
          }
        }
      }

      isCurrentlyPlaying.current = false;
      setNowPlaying(null);
      animationFrameId = requestAnimationFrame(playbackManager);
    };

    const handleCustomEvent = async (event: any) => {
      if (event.type !== "transcription.new") return;

      const data = event.custom; // payload is in .custom property
      if (!data || !data.text) return;

      // Filter by speaker
      if (data.speakerId !== targetUserId) return;

      console.log(`[TTS] Received event:`, data);

      // Process Text
      const text = data.text;

      // Translate - ONLY if translation is enabled and a language is selected
      if (isTranslationEnabled && targetLanguage && targetLanguage !== "off") {
        try {
          const translated = await getTranslation(text, targetLanguage);
          if (translated) {
            playbackQueue.current.push(translated);
            setStatus(`Received & Translated: "${text.substring(0, 10)}..."`);
            setStatusType("info");

            // Save translated text per user request
            saveTranslation({
              user_id: targetUserId, // The speaker
              meeting_id: meetingId,
              source_lang: "auto",
              target_lang: targetLanguage,
              original_text: text,
              translated_text: translated
            }).catch(e => console.warn("Failed to save translation:", e));
          }
        } catch (err) {
          console.error("Translation error:", err);
        }
      } else {
        // If translation off or disabled, we don't queue anything for playback
        console.log(`[TTS] Translation skipped (Enabled: ${isTranslationEnabled}, Lang: ${targetLanguage})`);
      }
    };

    // removed sentenceFinder polling

    if (call) {
      call.on("custom", handleCustomEvent);
    }

    const startFlow = async () => {
      if (!targetUserId) {
        setStatus("Waiting for User ID...");
        return;
      }

      if (!hasUserInteracted) {
        setStatus("Click 'Enable Audio' to start.");
        return;
      }

      setStatus("Ready. Waiting for live speech...");
      // Optional: Fetch history once if needed, but we focus on live events now.

      // Start Loops
      animationFrameId = requestAnimationFrame(playbackManager);
    };



    startFlow();

    return () => {
      isMounted.current = false;
      cancelAnimationFrame(animationFrameId);
      if (call) call.off("custom", handleCustomEvent);
    };
  }, [targetUserId, hasUserInteracted, selectedSinkId, targetLanguage, meetingId, call]);

  const enableAudio = () => {
    setHasUserInteracted(true);
    new Audio().play().catch(() => { });
  };

  const disableAudio = () => {
    setHasUserInteracted(false);
    setStatus("Stopped.");
  };

  const value = {
    targetUserId,
    setTargetUserId,
    isMuted,
    setIsMuted,
    isTranslationEnabled,
    setIsTranslationEnabled,
    status,
    statusType,
    nowPlaying,
    hasUserInteracted,
    enableAudio,
    disableAudio,
    audioDevices,
    selectedSinkId,
    setSelectedSinkId
  };

  return <TTSContext.Provider value={value}>{children}</TTSContext.Provider>;
}
