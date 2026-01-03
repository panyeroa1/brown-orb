import { useCallStateHooks } from "@stream-io/video-react-sdk";
import { useMemo } from "react";

export interface Speaker {
  id: string;
  name: string;
  isLocal: boolean;
}

export function useMeetingSpeakers(meetingId: string, currentUserId: string) {
  const { useParticipants } = useCallStateHooks();
  const participants = useParticipants();

  const speakers = useMemo(() => {
    return participants.map((p) => ({
      id: p.userId,
      name: p.userId === currentUserId ? "You" : p.name || p.userId.slice(0, 8),
      isLocal: p.userId === currentUserId,
    }));
  }, [participants, currentUserId]);

  return { 
    speakers, 
    isLoading: false // Stream SDK state is live, no local "loading" needed
  };
}

