const base = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_PUBLISHABLE_KEY;
if (!base || !key) throw new Error('Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY first.');
const endpoint = `${base.replace(/\/$/, '')}/rest/v1/channels?select=id&limit=10`;
const total = 360;
const started = performance.now();
const results = await Promise.all(Array.from({length: total}, async () => {
  const t = performance.now();
  try {
    const r = await fetch(endpoint, {headers:{apikey:key, Accept:'application/json'}});
    await r.arrayBuffer();
    return {ok:r.ok,status:r.status,ms:performance.now()-t};
  } catch (e) { return {ok:false,status:0,ms:performance.now()-t,error:String(e)}; }
}));
const lat = results.map(x=>x.ms).sort((a,b)=>a-b);
const pct = p => lat[Math.max(0,Math.ceil(p*lat.length)-1)];
console.log(JSON.stringify({requests:total,ok:results.filter(x=>x.ok).length,errors:results.filter(x=>!x.ok).length,wall_ms:+(performance.now()-started).toFixed(1),p50_ms:+pct(.5).toFixed(1),p95_ms:+pct(.95).toFixed(1),p99_ms:+pct(.99).toFixed(1),max_ms:+lat.at(-1).toFixed(1)},null,2));
