"use client";

import { useCallback, useEffect, useRef } from "react";

import { useTranslatorStore } from "@/store/use-translator";

type CaptionsTTSProps = {
  localUserId?: string;
};

type QueueItem = {
  utteranceId: string;
  text: string;
  lang: string;
  voice?: string;
};

export const CaptionsTTS = ({ localUserId }: CaptionsTTSProps) => {
  const captionBuffer = useTranslatorStore((state) => state.captionBuffer);
  const autoTranslateEnabled = useTranslatorStore(
    (state) => state.autoTranslateEnabled
  );
  const targetLang = useTranslatorStore((state) => state.targetLang);
  const ttsEnabled = useTranslatorStore((state) => state.ttsEnabled);
  const ttsVoice = useTranslatorStore((state) => state.ttsVoice);

  const spokenRef = useRef(new Set<string>());
  const queueRef = useRef<QueueItem[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const playingRef = useRef(false);
  const enabledAtRef = useRef<number | null>(null);

  const playNext = useCallback(async () => {
    const next = queueRef.current.shift();
    if (!next) {
      playingRef.current = false;
      return;
    }

    playingRef.current = true;

    try {
      const response = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: next.text,
          voice: next.voice,
          lang: next.lang,
        }),
      });

      if (!response.ok) {
        throw new Error("TTS request failed.");
      }

      const blob = await response.blob();
      if (!useTranslatorStore.getState().ttsEnabled) {
        playingRef.current = false;
        return;
      }
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      audioUrlRef.current = url;

      audio.onended = () => {
        if (audioUrlRef.current) {
          URL.revokeObjectURL(audioUrlRef.current);
          audioUrlRef.current = null;
        }
        audioRef.current = null;
        if (useTranslatorStore.getState().ttsEnabled) {
          void playNext();
        } else {
          playingRef.current = false;
        }
      };
      audio.onerror = () => {
        if (audioUrlRef.current) {
          URL.revokeObjectURL(audioUrlRef.current);
          audioUrlRef.current = null;
        }
        audioRef.current = null;
        if (useTranslatorStore.getState().ttsEnabled) {
          void playNext();
        } else {
          playingRef.current = false;
        }
      };

      await audio.play();
    } catch {
      playingRef.current = false;
      if (useTranslatorStore.getState().ttsEnabled) {
        void playNext();
      }
    }
  }, []);

  useEffect(() => {
    if (!ttsEnabled) {
      queueRef.current = [];
      spokenRef.current.clear();
      enabledAtRef.current = null;
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
        audioUrlRef.current = null;
      }
      playingRef.current = false;
      return;
    }

    enabledAtRef.current = Date.now();
  }, [ttsEnabled]);

  useEffect(() => {
    if (!ttsEnabled) return;

    const enabledAt = enabledAtRef.current ?? 0;

    captionBuffer.forEach((caption) => {
      if (!caption.isFinal) return;
      if (caption.ts < enabledAt) return;
      if (caption.speakerUserId === localUserId) return;
      if (spokenRef.current.has(caption.utteranceId)) return;

      const text = autoTranslateEnabled
        ? caption.translatedText
        : caption.text;

      if (autoTranslateEnabled && !caption.translatedText) return;
      if (!text) return;

      const lang = autoTranslateEnabled ? targetLang : caption.sourceLang;
      const voice = ttsVoice.trim() || undefined;

      spokenRef.current.add(caption.utteranceId);
      queueRef.current.push({
        utteranceId: caption.utteranceId,
        text,
        lang,
        voice,
      });

      if (!playingRef.current) {
        void playNext();
      }
    });
  }, [
    captionBuffer,
    ttsEnabled,
    autoTranslateEnabled,
    targetLang,
    ttsVoice,
    localUserId,
    playNext,
  ]);

  return null;
};
