import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const MAX_TEXT_LENGTH = 600;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 12;

const rateLimit = new Map<string, { count: number; windowStart: number }>();

const checkRateLimit = (userId: string) => {
  const now = Date.now();
  const entry = rateLimit.get(userId);

  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimit.set(userId, { count: 1, windowStart: now });
    return true;
  }

  if (entry.count >= RATE_LIMIT_MAX) return false;

  entry.count += 1;
  rateLimit.set(userId, entry);
  return true;
};

export async function POST(req: Request) {
  const { userId } = auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!checkRateLimit(userId)) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429 }
    );
  }

  let payload: { text?: string; voice?: string; lang?: string };
  try {
    payload = (await req.json()) as {
      text?: string;
      voice?: string;
      lang?: string;
    };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const text = payload.text?.trim() ?? "";
  const voice = payload.voice?.trim() || process.env.GEMINI_TTS_VOICE?.trim();
  const lang = payload.lang?.trim();

  if (!text) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  if (text.length > MAX_TEXT_LENGTH) {
    return NextResponse.json({ error: "Text too long" }, { status: 413 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Gemini API key is not configured" },
      { status: 500 }
    );
  }

  const model =
    process.env.GEMINI_TTS_MODEL ??
    "models/gemini-2.5-flash-native-audio-preview-12-2025";
  const modelPath = model.startsWith("models/") ? model : `models/${model}`;
  const prompt = lang ? `Speak in ${lang}. ${text}` : text;

  const body: Record<string, unknown> = {
    contents: [
      {
        role: "user",
        parts: [{ text: prompt }],
      },
    ],
    generationConfig: {
      responseModalities: ["AUDIO"],
      temperature: 0.2,
      ...(voice
        ? {
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: voice,
                },
              },
            },
          }
        : {}),
    },
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/${modelPath}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      }
    );

    if (!response.ok) {
      return NextResponse.json(
        { error: "TTS request failed" },
        { status: 502 }
      );
    }

    const data = (await response.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ inlineData?: { data?: string; mimeType?: string } }> };
      }>;
    };

    const inlineData = data.candidates?.[0]?.content?.parts?.find(
      (part) => part.inlineData?.data
    )?.inlineData;

    if (!inlineData?.data) {
      return NextResponse.json(
        { error: "No audio returned" },
        { status: 502 }
      );
    }

    const buffer = Buffer.from(inlineData.data, "base64");
    const mimeType = inlineData.mimeType || "audio/mpeg";

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": mimeType,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "TTS failed";
    return NextResponse.json({ error: message }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}
