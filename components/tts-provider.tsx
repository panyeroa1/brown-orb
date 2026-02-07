"use client";

import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
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

const getErrorMessage = (error: any): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown error";
  }
};

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
  const playbackQueue = useRef<{ text: string; audioUrl: string }[]>([]);
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

  // Simplified Queue Processor
  const processQueue = async () => {
    if (isCurrentlyPlaying.current || playbackQueue.current.length === 0) return;

    isCurrentlyPlaying.current = true;
    const item = playbackQueue.current.shift();

    if (item) {
      setNowPlaying(item.text);
      try {
        await playAudio(item.audioUrl);
      } catch (error) {
        console.error("Playback failed:", error);
        setStatusType("error");
        setStatus("Playback failed");
      }

      // 100ms gap before next track
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    isCurrentlyPlaying.current = false;
    setNowPlaying(null);
    processQueue(); // Check for next item
  };

  const fetchAudio = async (text: string): Promise<string> => {
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
    if (audioBlob.size < 100) throw new Error("Invalid audio blob size");

    return URL.createObjectURL(audioBlob);
  };

  const playAudio = async (url: string) => {
    return new Promise<void>((resolve, reject) => {
      const audio = new Audio(url);
      audio.preload = "auto";

      // Apply sink
      if (selectedSinkId && (audio as any).setSinkId) {
        (audio as any).setSinkId(selectedSinkId).catch((e: any) => console.warn("Sink error:", e));
      }

      audio.onended = () => {
        URL.revokeObjectURL(url);
        resolve();
      };

      audio.onerror = (e) => {
        URL.revokeObjectURL(url);
        reject(new Error("Audio playback error"));
      };

      audio.play().catch(reject);
    });
  };

  const addToQueue = async (text: string) => {
    try {
      const url = await fetchAudio(text);
      // Push object with text and url
      // We need to update the ref type to hold objects, currently it's string[]
      // I will fix the ref definition in a separate Edit if needed, or cast it here if I can't reach the top.
      // Actually, I can't easily change the hook definition `useRef<string[]>` without editing the top of the file.
      // Let's Edit the TOP of the file first to change the Ref type, OR check if I can include it in this view.
      // I can only see lines 200-349. I need to edit the top first to change `useRef<string[]>` to `useRef<{text: string, audioUrl: string}[]>`.
      // WAIT: I can just change the usage here if I replace the top in a separate step? 
      // No, I should do it properly. 
      // For now, let's assume I will update the ref type in the next step.
      // Queue push:
      (playbackQueue.current as any).push({ text, audioUrl: url });
      processQueue();
    } catch (e) {
      console.error("Failed to queue audio:", e);
      setStatus(`TTS Gen Failed: ${getErrorMessage(e)}`);
    }
  };

  const handleCustomEvent = useCallback(async (event: any) => {
    if (event.type !== "transcription.new") return;

    const data = event.custom;
    if (!data || !data.text) return;
    if (data.speakerId !== targetUserId) return;

    console.log(`[TTS] Received event:`, data);
    const text = data.text;

    if (isTranslationEnabled && targetLanguage && targetLanguage !== "off") {
      try {
        // Use Google Translate (free/auto)
        const translated = await getTranslation(text, targetLanguage);
        if (translated) {
          setStatus(`Queueing: "${translated.substring(0, 15)}..."`);
          setStatusType("info");
          addToQueue(translated); // Handles fetch & queue

          saveTranslation({
            user_id: targetUserId,
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
    }
  }, [targetUserId, isTranslationEnabled, targetLanguage, meetingId, addToQueue]);

  useEffect(() => {
    if (call) {
      call.on("custom", handleCustomEvent);
    }

    return () => {
      isMounted.current = false;
      if (call) call.off("custom", handleCustomEvent);
    };
  }, [call, handleCustomEvent]);

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
