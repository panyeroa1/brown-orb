import { NextRequest, NextResponse } from "next/server";

const OLLAMA_API_KEY = process.env.OLLAMA_API_KEY;
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "gpt-oss:120b";
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "https://ollama.com/api";
const OLLAMA_API_URL = OLLAMA_BASE_URL.replace(/\/v1\/?$/, ""); // Normalize: remove trailing /v1
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

    const attemptLogs: string[] = [];
    
    // --- Provider: Google Free (Primary) ---
    try {
      console.log(`[TranslateAPI] Attempting Google Free translation...`);
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

    return NextResponse.json(
      { error: "Translation provider failed", details: attemptLogs },
      { status: 502 }
    );
  } catch (error) {
    console.error("Translation route error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
