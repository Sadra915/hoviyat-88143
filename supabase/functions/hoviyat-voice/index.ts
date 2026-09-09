import { withSupabase } from "npm:@supabase/server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

function base64ToBytes(base64: string) {
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

    const { data: policy, error: policyError } = await ctx.supabase.rpc("get_my_restrictions");
    if (policyError) return json({ error: "خطا در بررسی دسترسی دستیار صوتی" }, 503);
    if (policy?.active && policy?.restrictions?.ai === false) {
      return json({ error: "دسترسی AI برای این حساب محدود شده است.", code: "USER_RESTRICTED" }, 403);
    }

    const body = await req.json().catch(() => null) as { audio?: string; mimeType?: string; prompt?: string } | null;
    if (!body?.audio || typeof body.audio !== "string") return json({ error: "فایل صوتی ارسال نشده است." }, 400);
    if (body.audio.length > 12_000_000) return json({ error: "فایل صوتی بیش از حد بزرگ است." }, 413);

    const apiKey = Deno.env.get("AI_API_KEY");
    const baseUrl = (Deno.env.get("AI_BASE_URL") || "https://api.openai.com/v1").replace(/\/$/, "");
    const model = Deno.env.get("AI_MODEL") || "gpt-4.1-mini";
    if (!apiKey) return json({ error: "Voice API Secret تنظیم نشده است.", configured: false }, 503);

    const mime = typeof body.mimeType === "string" && body.mimeType ? body.mimeType : "audio/webm";
    const ext = mime.includes("ogg") ? "ogg" : mime.includes("mp4") ? "mp4" : "webm";
    const audioBytes = base64ToBytes(body.audio);
    const form = new FormData();
    form.append("file", new File([audioBytes], `voice.${ext}`, { type: mime }));
    form.append("model", Deno.env.get("AI_TRANSCRIBE_MODEL") || "gpt-4o-mini-transcribe");
    form.append("language", "fa");

    const transcription = await fetch(`${baseUrl}/audio/transcriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
    if (!transcription.ok) return json({ error: "تبدیل صدا به متن ناموفق بود.", configured: true }, 502);
    const transcript = String((await transcription.json())?.text || "").trim().slice(0, 4000);
    if (!transcript) return json({ error: "صدای قابل تشخیصی پیدا نشد.", configured: true }, 422);

    const completion = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        temperature: 0.25,
        max_tokens: 700,
        messages: [
          { role: "system", content: "تو دستیار صوتی پیام‌رسان هویت هستی. پاسخ فارسی، کوتاه، دقیق و کاربردی باشد." },
          { role: "user", content: `${body.prompt ? `${body.prompt}\n\n` : ""}گفتار کاربر:\n${transcript}` },
        ],
      }),
    });
    if (!completion.ok) return json({ transcript, error: "پاسخ AI دریافت نشد.", configured: true }, 502);
    const answer = String((await completion.json())?.choices?.[0]?.message?.content || "").trim().slice(0, 8000);
    return json({ transcript, answer, configured: true, provider: model });
  }),
};
