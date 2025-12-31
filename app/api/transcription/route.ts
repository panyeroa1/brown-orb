import { NextRequest, NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = 
  process.env.SUPABASE_SERVICE_KEY || 
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

function getSupabaseClient(): SupabaseClient | null {
  if (supabaseUrl && supabaseKey) {
    return createClient(supabaseUrl, supabaseKey);
  }
  return null;
}

/**
 * POST /api/transcription
 * Body: { user_id, room_name, sender, text }
 */
export async function POST(request: NextRequest) {
  const supabase = getSupabaseClient();
  
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }

  try {
    const body = await request.json();
    const { user_id, room_name, sender, text } = body;

    if (!room_name || !text) {
      return NextResponse.json(
        { error: "Missing required fields: room_name and text" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("transcriptions")
      .insert([{ user_id, room_name, sender: sender || "Speaker", text }])
      .select();

    if (error) {
      console.error("Supabase insert error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Transcription API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * GET /api/transcription?room_name=xxx
 */
export async function GET(request: NextRequest) {
  const supabase = getSupabaseClient();
  
  if (!supabase) {
    return NextResponse.json({ transcriptions: [] }, { status: 200 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const roomName = searchParams.get("room_name");

    let query = supabase
      .from("transcriptions")
      .select("*")
      .order("created_at", { ascending: true });

    if (roomName) {
      query = query.eq("room_name", roomName);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Supabase query error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ transcriptions: data || [] });
  } catch (error) {
    console.error("Transcription API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
