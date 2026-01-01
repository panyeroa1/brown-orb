import { NextRequest, NextResponse } from "next/server";

const OLLAMA_API_KEY = process.env.OLLAMA_API_KEY;
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "gpt-oss:120b";
const OLLAMA_API_URL = "https://ollama.com/api";
// Default to TRUE unless explicitly disabled with "0"
const USE_GOOGLE_FALLBACK = process.env.GOOGLE_FREE_TRANSLATE !== "0";

export async function GET() {
  console.log("[TranslateAPI] GET request received");
  return NextResponse.json({ 
    status: "Translation API is active", 
    primary_provider: "Ollama Cloud (gpt-oss:120b)",
    fallback_provider: "Google Free" 
  });
}

export async function POST(request: NextRequest) {
  console.log("[TranslateAPI] POST request received");
  try {
    const { text, target_lang, source_lang = "auto" } = await request.json();

    if (!text || !target_lang) {
      return NextResponse.json(
        { error: "Missing required fields: text and target_lang" },
        { status: 400 }
      );
    }

    const prompt = `Translate the following text from ${source_lang} to ${target_lang}. Return ONLY the translated text without any explanations or extra characters: "${text}"`;

    const attemptLogs: string[] = [];
    
    // --- Provider 1: Ollama Cloud (Primary) ---
    if (OLLAMA_API_KEY) {
      try {
        console.log(`[TranslateAPI] Attempting Ollama Cloud translation (${OLLAMA_MODEL})...`);
        const ollamaResponse = await fetch(`${OLLAMA_API_URL}/chat`, {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            "Authorization": `Bearer ${OLLAMA_API_KEY}`
          },
          body: JSON.stringify({
            model: OLLAMA_MODEL,
            messages: [{ role: "user", content: prompt }],
            stream: false
          }),
        });

        if (ollamaResponse.ok) {
          const data = await ollamaResponse.json();
          const translatedText = data.message?.content?.trim();
          if (translatedText) {
            console.log("[TranslateAPI] Ollama success");
            return NextResponse.json({ 
              translated_text: translatedText.replace(/^"|"$/g, ''), 
              provider: "ollama" 
            });
          }
        } else {
          const errData = await ollamaResponse.json().catch(() => ({}));
          console.warn("[TranslateAPI] Ollama failed:", ollamaResponse.status, errData);
          attemptLogs.push(`Ollama Failed: ${ollamaResponse.status}`);
        }
      } catch (e: any) {
        console.warn("[TranslateAPI] Ollama Exception:", e);
        attemptLogs.push(`Ollama Exception: ${e.message}`);
      }
    } else {
        console.warn("[TranslateAPI] OLLAMA_API_KEY not configured");
        attemptLogs.push("Ollama: Skipped (No Key)");
    }

    // --- Provider 2: Google Free (Final Fallback) ---
    if (USE_GOOGLE_FALLBACK) {
      try {
        console.log(`[TranslateAPI] Attempting Google Free fallback...`);
        const googleUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${source_lang === "auto" ? "auto" : source_lang}&tl=${target_lang}&dt=t&q=${encodeURIComponent(text)}`;
        const googleResponse = await fetch(googleUrl);
        if (googleResponse.ok) {
          const data = await googleResponse.json();
          const translatedText = data[0]?.[0]?.[0];
          if (translatedText) {
            console.log("[TranslateAPI] Google Free success");
            return NextResponse.json({ translated_text: translatedText, provider: "google-free" });
          }
        } else {
            attemptLogs.push(`Google Failed: ${googleResponse.status}`);
        }
      } catch (e: any) {
        console.error("[TranslateAPI] Google Free fallback failed:", e);
        attemptLogs.push(`Google Exception: ${e.message}`);
      }
    } else {
        attemptLogs.push("Google: Skipped (Disabled)");
    }

    return NextResponse.json(
      { error: "All translation providers failed", details: attemptLogs },
      { status: 502 }
    );
  } catch (error) {
    console.error("Translation route error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
