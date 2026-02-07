"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface DeepgramTranscript {
  text: string;
  isFinal: boolean;
  timestamp: number;
  confidence: number;
}

interface UseDeepgramSTTOptions {
  language?: string;
  model?: string;
}

interface UseDeepgramSTTReturn {
  transcript: DeepgramTranscript | null;
  isListening: boolean;
  start: () => Promise<void>;
  stop: () => void;
  error: string | null;
}

export function useDeepgramSTT(
  options: UseDeepgramSTTOptions = {}
): UseDeepgramSTTReturn {
  const { language = "en", model = "nova-2" } = options;

  const [transcript, setTranscript] = useState<DeepgramTranscript | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stop = useCallback(() => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }

    setIsListening(false);
  }, []);

  // Restart logic if language or model changes while listening
  useEffect(() => {
    if (isListening) {
      console.log("[useDeepgramSTT] Language or model changed, restarting...");
      stop();
      // Allow state to update before restarting
      setTimeout(() => {
        start().catch((e) => console.error("Failed to restart Deepgram after config change:", e));
      }, 100);
    }
  }, [language, model]); // eslint-disable-line react-hooks/exhaustive-deps

  const start = useCallback(async () => {
    setError(null);

    try {
      // Get temporary token from our API
      const tokenResponse = await fetch("/api/deepgram");
      if (!tokenResponse.ok) {
        const errorData = await tokenResponse.json();
        throw new Error(errorData.error || "Failed to get Deepgram token");
      }
      const { key } = await tokenResponse.json();

      // Get microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Connect to Deepgram WebSocket
      const wsUrl = `wss://api.deepgram.com/v1/listen?model=${model}&language=${language}&smart_format=true&interim_results=true`;
      const socket = new WebSocket(wsUrl, ["token", key]);
      socketRef.current = socket;

      socket.onopen = () => {
        console.log("Deepgram WebSocket connected");
        setIsListening(true);

        // Start recording and sending audio
        const mediaRecorder = new MediaRecorder(stream, {
          mimeType: "audio/webm",
        });
        mediaRecorderRef.current = mediaRecorder;

        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0 && socket.readyState === WebSocket.OPEN) {
            socket.send(event.data);
          }
        };

        mediaRecorder.start(250); // Send audio every 250ms
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.channel?.alternatives?.[0]) {
            const alternative = data.channel.alternatives[0];
            if (alternative.transcript) {
              setTranscript({
                text: alternative.transcript,
                isFinal: data.is_final || false,
                timestamp: Date.now(),
                confidence: alternative.confidence || 0,
              });
            }
          }
        } catch (e) {
          console.error("Error parsing Deepgram message:", e);
        }
      };

      socket.onerror = (event) => {
        console.error("Deepgram WebSocket error:", event);
        setError("Deepgram connection error");
        stop();
      };

      socket.onclose = () => {
        console.log("Deepgram WebSocket closed");
        setIsListening(false);
      };
    } catch (e) {
      console.error("Failed to start Deepgram STT:", e);
      setError(e instanceof Error ? e.message : "Failed to start Deepgram");
      stop();
    }
  }, [language, model, stop]);

  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  return {
    transcript,
    isListening,
    start,
    stop,
    error,
  };
}
