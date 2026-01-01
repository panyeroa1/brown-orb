import { supabase } from "@/lib/supabase";

export interface TranslationEntry {
  id?: string;
  user_id: string;
  meeting_id: string;
  source_lang: string;
  target_lang: string;
  original_text: string;
  translated_text: string;
  created_at?: string;
}

/**
 * Call the translation API to get the translated text
 */
export async function getTranslation(
  text: string, 
  targetLang: string, 
  sourceLang: string = "auto"
): Promise<string | null> {
  try {
    const response = await fetch("/api/translate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        target_lang: targetLang,
        source_lang: sourceLang,
      }),
    });

    if (!response.ok) {
      throw new Error(`Translation API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.translated_text;
  } catch (error) {
    console.error("Failed to get translation:", error);
    return null;
  }
}

/**
 * Save a translation entry to Supabase
 */
export async function saveTranslation(
  entry: Omit<TranslationEntry, "id" | "created_at">
): Promise<{ success: boolean; error?: string }> {
  console.log("[saveTranslation] Attempting to save entry:", entry);
  try {
    const { data, error } = await supabase.from("translations").insert([entry]);

    if (error) {
      console.error("[saveTranslation] Supabase error detail:", {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
      });
      return { success: false, error: error.message };
    }

    console.log("[saveTranslation] Success! Row inserted:", data);
    return { success: true };
  } catch (e) {
    console.error("[saveTranslation] Unexpected exception:", e);
    return {
      success: false,
      error: e instanceof Error ? e.message : "Unknown error",
    };
  }
}
