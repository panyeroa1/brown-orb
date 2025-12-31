import { supabase } from "@/lib/supabase";

export interface TranscriptionEntry {
  id?: string;
  user_id: string;
  room_name: string;
  sender: string;
  text: string;
  created_at?: string;
}

/**
 * Save a transcription entry to Supabase
 */
export async function saveTranscription(
  entry: Omit<TranscriptionEntry, "id" | "created_at">
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase.from("transcriptions").insert([entry]);

    if (error) {
      console.error("Failed to save transcription:", error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (e) {
    console.error("Error saving transcription:", e);
    return {
      success: false,
      error: e instanceof Error ? e.message : "Unknown error",
    };
  }
}

/**
 * Get transcriptions for a specific room
 */
export async function getTranscriptionsForRoom(
  roomName: string
): Promise<TranscriptionEntry[]> {
  try {
    const { data, error } = await supabase
      .from("transcriptions")
      .select("*")
      .eq("room_name", roomName)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Failed to fetch transcriptions:", error);
      return [];
    }

    return data || [];
  } catch (e) {
    console.error("Error fetching transcriptions:", e);
    return [];
  }
}
