"use client";

import { Button } from "@/components/ui/button";
import { Volume2, VolumeX } from "lucide-react";
import { useTTS } from "@/components/tts-provider";

interface AutoPlayingTTSProps {
  // Props are now handled via context mostly, but we keep the interface for compatibility if we pass initial here?
  // Actually, we can remove the explicit prop requirement if the provider handles it.
  // But strictly, the component signature should likely match what is used in Sidebar.
  userId?: string; // Optional now as it just reads from context
}

export function AutoPlayingTTS({ userId }: AutoPlayingTTSProps) {
  // We ignore the passed userId here because the Provider handles the "active" ID. 
  // The Sidebar passed it to the Provider via MeetingRoom.

  const {
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
  } = useTTS();

  return (
    <div className="space-y-4 rounded-lg bg-zinc-900/50 p-4 border border-white/10">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-purple-400">TTS Pipeline</h3>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsMuted(!isMuted)}
          className={isMuted ? "text-red-400" : "text-emerald-400"}
          title={isMuted ? "Unmute Audio" : "Mute Audio"}
        >
          {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        </Button>
      </div>
      
      <div className="space-y-2">
         <label htmlFor="target-user-id" className="text-[10px] text-zinc-500 uppercase font-bold">Target User ID</label>
         <input 
            id="target-user-id"
            value={targetUserId}
            onChange={(e) => setTargetUserId(e.target.value)}
            className="w-full bg-black/40 border border-white/10 rounded px-2 py-1 text-xs text-zinc-300 font-mono focus:outline-none focus:border-purple-500/50"
            placeholder="Enter User ID"
            aria-label="Target User ID"
         />
      </div>

      {!hasUserInteracted ? (
        <Button 
            onClick={enableAudio} 
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs py-1 h-8 font-semibold shadow-lg shadow-emerald-900/20 transition-all active:scale-[0.98]"
        >
            Start Live Listening
        </Button>
      ) : (
        <Button 
            onClick={disableAudio} 
            variant="destructive"
            className="w-full bg-red-600/80 hover:bg-red-700 text-white text-xs py-1 h-8 transition-all active:scale-[0.98]"
        >
            Stop Listening
        </Button>
      )}

      {nowPlaying ? (
        <div className="rounded border border-purple-500/30 bg-purple-500/10 p-3">
          <p className="text-xs font-semibold text-purple-300 mb-1">NOW PLAYING:</p>
          <p className="text-sm text-white italic">&quot;{nowPlaying}&quot;</p>
        </div>
      ) : (
        <div className="rounded border border-white/5 bg-white/5 p-3 text-center">
            <p className="text-xs text-zinc-500">
                {hasUserInteracted ? "Silent..." : "Audio Locked"}
            </p>
        </div>
      )}

      <div className={`text-xs rounded px-2 py-1 ${
          statusType === "error" ? "bg-red-500/20 text-red-300" : "bg-blue-500/20 text-blue-300"
      }`}>
        {status}
      </div>
    </div>
  );
}
