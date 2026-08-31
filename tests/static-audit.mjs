import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const html = fs.readFileSync(path.join(root,'index.html'),'utf8');
const ids = [...html.matchAll(/\bid=["']([^"']+)["']/g)].map(m=>m[1]);
const counts = new Map(); ids.forEach(id=>counts.set(id,(counts.get(id)||0)+1));
const duplicates=[...counts].filter(([,n])=>n>1);
if(duplicates.length) throw new Error('Duplicate IDs: '+JSON.stringify(duplicates));
for(const f of fs.readdirSync(path.join(root,'js')).filter(x=>x.endsWith('.js'))){
  const src=fs.readFileSync(path.join(root,'js',f),'utf8');
  if(/export\s+/.test(src) || /import\s+/.test(src)) continue;
}
console.log('Static audit passed: no duplicate IDs in index.html');
