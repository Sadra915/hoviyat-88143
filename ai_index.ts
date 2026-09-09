import { withSupabase } from "npm:@supabase/server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(data: unknown, status = 200) { return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" } }); }
function cleanMessages(input: unknown): string[] { if (!Array.isArray(input)) return []; return input.filter((x): x is string => typeof x === "string").map((x) => x.replace(/\s+/g, " ").trim().slice(0, 2000)).filter(Boolean).slice(-30); }
function localFallback(messages: string[], mode: string) { if (!messages.length) return "هنوز پیامی برای تحلیل در این گفتگو وجود ندارد."; const unique=[...new Set(messages)]; if(mode==="last") return "خلاصه پیام‌های اخیر:\n• "+unique.slice(-8).join("\n• "); if(mode==="keypoints") return "نکات مهم:\n• "+(unique.filter((x)=>x.length>=12).slice(-8).join("\n• ")||"نکته مشخصی پیدا نشد."); if(mode==="rewrite") return "بازنویسی پیشنهادی:\n"+(unique.at(-1)||""); return "خلاصه گفتگو:\n• "+unique.slice(-10).join("\n• "); }
export default { fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
  if(req.method==="OPTIONS") return new Response("ok",{headers:corsHeaders});
  if(req.method!=="POST") return json({error:"Method not allowed"},405);
  const { data: policy, error: policyError } = await ctx.supabase.rpc("get_my_restrictions");
  if(policyError) return json({error:"خطا در بررسی دسترسی AI"},503);
  if(policy?.active && policy?.restrictions && policy.restrictions.ai === false) return json({error:"دسترسی Hoviyat AI برای این حساب محدود شده است.", code:"USER_RESTRICTED", action:"ai"},403);
  const body=await req.json().catch(()=>null) as {mode?:string;messages?:unknown;prompt?:string}|null;
  const mode=typeof body?.mode==="string"?body.mode.slice(0,32):"summary"; const messages=cleanMessages(body?.messages); const prompt=typeof body?.prompt==="string"?body.prompt.replace(/\s+/g," ").trim().slice(0,4000):"";
  if(messages.length>30||prompt.length>4000) return json({error:"ورودی بیش از حد مجاز است."},400);
  const apiKey=Deno.env.get("AI_API_KEY"); const baseUrl=(Deno.env.get("AI_BASE_URL")||"https://api.openai.com/v1").replace(/\/$/,""); const model=Deno.env.get("AI_MODEL")||"gpt-4.1-mini";
  if(!apiKey) return json({text:localFallback(messages,mode),provider:"local-fallback",configured:false});
  const system="تو دستیار هوش مصنوعی پیام‌رسان هویت هستی. پاسخ‌ها فارسی، دقیق، کوتاه و کاربردی باشند. فقط بر اساس داده‌های همین درخواست پاسخ بده و اطلاعات خصوصی خارج از آن را حدس نزن."; const user=prompt||`حالت: ${mode}\nپیام‌های گفتگو:\n${messages.map((m,i)=>`${i+1}. ${m}`).join("\n")}`;
  const upstream=await fetch(`${baseUrl}/chat/completions`,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${apiKey}`},body:JSON.stringify({model,temperature:0.25,max_tokens:700,messages:[{role:"system",content:system},{role:"user",content:user}]})});
  if(!upstream.ok){const detail=await upstream.text().catch(()=>""); console.error("AI upstream error",upstream.status,detail.slice(0,1000)); return json({text:localFallback(messages,mode),provider:"local-fallback",configured:true,upstreamError:true},200);} const result=await upstream.json(); const text=result?.choices?.[0]?.message?.content?.trim(); if(!text) return json({text:localFallback(messages,mode),provider:"local-fallback",configured:true}); return json({text,provider:model,configured:true});
})};
