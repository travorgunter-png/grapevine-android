import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

type InlineMedia = { mime_type: string; data: string; name?: string };

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function validateMedia(value: unknown, prefix: "image/" | "audio/"): InlineMedia | null {
  if (value == null) return null;
  if (typeof value !== "object") throw new Error("Invalid media attachment");
  const item = value as Record<string, unknown>;
  const mime = typeof item.mime_type === "string" ? item.mime_type.toLowerCase() : "";
  const data = typeof item.data === "string" ? item.data : "";
  if (!mime.startsWith(prefix) || !data || data.length > 4_300_000) {
    throw new Error(`Unsupported ${prefix === "image/" ? "image" : "audio"} attachment or file too large`);
  }
  if (prefix === "image/" && !["image/jpeg", "image/png", "image/webp"].includes(mime)) {
    throw new Error("Use a JPEG, PNG, or WebP image");
  }
  if (prefix === "audio/" && !["audio/wav", "audio/x-wav", "audio/mpeg", "audio/mp3", "audio/ogg", "audio/webm", "audio/mp4", "audio/x-m4a", "audio/m4a", "audio/3gpp", "audio/amr", "audio/aac", "audio/flac"].includes(mime)) {
    throw new Error("This audio format is not supported. Try WAV, MP3, OGG, WebM, or M4A/MP4 audio");
  }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(data)) throw new Error("Invalid media encoding");
  return { mime_type: mime, data, name: typeof item.name === "string" ? item.name.slice(0, 160) : "" };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
    const geminiKey = Deno.env.get("GEMINI_API_KEY");
    const authorization = req.headers.get("Authorization") || "";
    if (!supabaseUrl || !anonKey || !geminiKey) {
      return json(500, { error: "Mafia AI is not configured. Check Supabase function secrets." });
    }
    if (!authorization.startsWith("Bearer ")) return json(401, { error: "Sign in to use Mafia AI" });

    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await supabase.auth.getUser();
    const user = authData?.user;
    if (authError || !user) return json(401, { error: "Your session expired. Sign in again." });

    const body = await req.json();
    const conversationId = typeof body.conversation_id === "string" ? body.conversation_id : "";
    const prompt = typeof body.message === "string" ? body.message.trim().slice(0, 12000) : "";
    const image = validateMedia(body.image, "image/");
    const audio = validateMedia(body.audio, "audio/");
    if (!conversationId || (!prompt && !image && !audio)) {
      return json(400, { error: "Provide a conversation and a message, image, or audio file." });
    }
    if (image && audio) return json(400, { error: "Attach one media file per message." });

    // The signed-in user may only send into a conversation they own.
    const { data: conversation, error: conversationError } = await supabase
      .from("mafia_ai_conversations")
      .select("id,user_id")
      .eq("id", conversationId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (conversationError || !conversation) return json(403, { error: "You can only send messages in your own Mafia AI conversation." });

    const effectivePrompt = prompt || (image ? "Please analyze the attached image and answer helpfully." : "Please listen to the attached audio, transcribe or summarize it, and respond helpfully.");
    const parts: Array<Record<string, unknown>> = [{ text: effectivePrompt }];
    if (image) parts.push({ inline_data: { mime_type: image.mime_type, data: image.data } });
    if (audio) parts.push({ inline_data: { mime_type: audio.mime_type, data: audio.data } });

    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(geminiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
        }),
      },
    );
    const geminiBody = await geminiResponse.json().catch(() => ({}));
    if (!geminiResponse.ok) {
      const detail = (geminiBody as any)?.error?.message || "The AI provider rejected the request";
      return json(502, { error: `Mafia AI provider error: ${detail}` });
    }
    const candidates = (geminiBody as any)?.candidates || [];
    const reply = candidates[0]?.content?.parts?.map((part: any) => part.text || "").join("").trim();
    if (!reply) return json(502, { error: "Mafia AI did not return a text response. Please try again." });

    const savedPrompt = [
      prompt || (image ? "Please analyze the attached image." : "Please respond to the attached audio."),
      image ? `[Image attached: ${image.name || image.mime_type}]` : "",
      audio ? `[Audio attached: ${audio.name || audio.mime_type}]` : "",
    ].filter(Boolean).join("\n");

    const { error: userMessageError } = await supabase.from("mafia_ai_messages").insert({
      conversation_id: conversationId,
      user_id: user.id,
      role: "user",
      content: savedPrompt,
    });
    if (userMessageError) return json(500, { error: `Could not save your message: ${userMessageError.message}` });

    const { error: assistantMessageError } = await supabase.from("mafia_ai_messages").insert({
      conversation_id: conversationId,
      user_id: user.id,
      role: "assistant",
      content: reply,
    });
    if (assistantMessageError) return json(500, { error: `AI replied, but history could not be saved: ${assistantMessageError.message}` });

    await supabase.from("mafia_ai_conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", conversationId)
      .eq("user_id", user.id);

    return json(200, { reply });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected Mafia AI error";
    return json(400, { error: message });
  }
});
