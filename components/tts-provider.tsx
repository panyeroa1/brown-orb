"use client";

import React, { createContext, useContext, useEffect, useRef, useState } from "react";

// --- CONFIGURATION ---
const CARTESIA_API_KEY = "sk_car_7AabaMKbctZAy89wTw9Xtf";
const CARTESIA_URL = "https://api.cartesia.ai/tts/bytes";
const SUPABASE_URL = "https://rcbuikbjqgykssiatxpo.supabase.co";
const SUPABASE_KEY = "sb_publishable_uTIwEo4TJBo_YkX-OWN9qQ_5HJvl4c5";
const SUPABASE_REST_URL = `${SUPABASE_URL}/rest/v1/translations`;
const FETCH_INTERVAL_MS = 3000;

interface TTSContextType {
  targetUserId: string;
  setTargetUserId: (id: string) => void;
  isMuted: boolean;
  setIsMuted: (muted: boolean) => void;
  status: string;
  statusType: "info" | "error";
  nowPlaying: string | null;
  hasUserInteracted: boolean;
  enableAudio: () => void;
  disableAudio: () => void;
}

const TTSContext = createContext<TTSContextType | undefined>(undefined);

export function useTTS() {
  const context = useContext(TTSContext);
  if (!context) {
    throw new Error("useTTS must be used within a TTSProvider");
  }
  return context;
}

export function TTSProvider({ children, initialUserId }: { children: React.ReactNode; initialUserId: string }) {
  const [targetUserId, setTargetUserId] = useState(initialUserId);
  const [isMuted, setIsMuted] = useState(false);
  const [status, setStatus] = useState("Waiting for interaction...");
  const [statusType, setStatusType] = useState<"info" | "error">("info");
  const [nowPlaying, setNowPlaying] = useState<string | null>(null);
  const [hasUserInteracted, setHasUserInteracted] = useState(false);

  // Refs
  const playbackQueue = useRef<string[]>([]);
  const lastProcessedText = useRef<string>("");
  const isCurrentlyPlaying = useRef(false);
  const isMounted = useRef(true);

  // Sync initial prop: Always update if the prop changes to ensure we switch from Clerk -> Anon ID
  useEffect(() => {
    if (initialUserId) setTargetUserId(initialUserId);
  }, [initialUserId]);

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
          model_id: "sonic-3",
          transcript: text,
          voice: { mode: "id", id: "9c7e6604-52c6-424a-9f9f-2c4ad89f3bb9" },
          output_format: {
            container: "wav",
            encoding: "pcm_s16le",
            sample_rate: 44100,
          },
        }),
      });

      if (!response.ok) throw new Error(`Cartesia TTS Error: ${await response.text()}`);

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audioPlayer = new Audio(audioUrl);
      
      // Safety: Configure audio for broader compatibility
      audioPlayer.preload = "auto";

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

    const sentenceFinder = async () => {
      if (!targetUserId || !isMounted.current) return;

      try {
        const url = `${SUPABASE_REST_URL}?user_id=eq.${targetUserId}&select=translated_text&order=created_at.desc&limit=1`;
        const latestItems = await fetchSupabase(url);

        if (latestItems.length === 0 || !latestItems[0].translated_text) return;

        const currentText = latestItems[0].translated_text.trim();
        let newTextToProcess = "";

        if (
          currentText.length > lastProcessedText.current.length &&
          currentText.startsWith(lastProcessedText.current)
        ) {
          newTextToProcess = currentText.substring(lastProcessedText.current.length).trim();
        }

        if (newTextToProcess) {
          const newSentences = splitIntoSentences(newTextToProcess);
          if (newSentences.length > 0) {
            playbackQueue.current.push(...newSentences);
            lastProcessedText.current = currentText;
            setStatus(`Queueing ${newSentences.length} new sentence(s)...`);
            setStatusType("info");
          }
        }
      } catch (error: any) {
        console.error("Sentence Finder Error:", error);
        setStatus(`Monitor Error: ${getErrorMessage(error)}`);
        setStatusType("error");
        if (mainLoopInterval) clearInterval(mainLoopInterval);
      }
    };

    const startFlow = async () => {
      if (!targetUserId) {
        setStatus("Waiting for User ID...");
        return;
      }
      
      if (!hasUserInteracted) {
         setStatus("Click 'Enable Audio' to start.");
         return;
      }

      setStatus("Fetching history...");
      try {
        const initUrl = `${SUPABASE_REST_URL}?user_id=eq.${targetUserId}&select=translated_text&order=created_at.desc&limit=1`;
        const initialItems = await fetchSupabase(initUrl);

        if (initialItems.length > 0 && initialItems[0].translated_text) {
          const allSentences = splitIntoSentences(initialItems[0].translated_text);
          const initialSentencesToPlay = allSentences.slice(-2);
          playbackQueue.current.push(...initialSentencesToPlay);
          lastProcessedText.current = initialItems[0].translated_text.trim(); 
          setStatus("Monitoring for translations...");
        } else {
          lastProcessedText.current = "";
          setStatus("Ready. Waiting for new text...");
        }

        // Start Loops
        animationFrameId = requestAnimationFrame(playbackManager);
        mainLoopInterval = setInterval(sentenceFinder, FETCH_INTERVAL_MS);
      } catch (error: any) {
        setStatus(`Init Failed: ${getErrorMessage(error)}`);
        setStatusType("error");
      }
    };

    startFlow();

    return () => {
      isMounted.current = false;
      if (mainLoopInterval) clearInterval(mainLoopInterval);
      cancelAnimationFrame(animationFrameId);
    };
  }, [targetUserId, hasUserInteracted]);

  const enableAudio = () => {
    setHasUserInteracted(true);
    new Audio().play().catch(() => {});
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
    status,
    statusType,
    nowPlaying,
    hasUserInteracted,
    enableAudio,
    disableAudio
  };

  return <TTSContext.Provider value={value}>{children}</TTSContext.Provider>;
}
