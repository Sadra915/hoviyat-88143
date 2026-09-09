#!/usr/bin/env node
import fs from "node:fs"; import path from "node:path";
const root=process.cwd(), out=path.join(root,"dist-app");
function cp(s,d){fs.mkdirSync(path.dirname(d),{recursive:true});fs.copyFileSync(s,d)}
fs.rmSync(out,{recursive:true,force:true});fs.mkdirSync(out,{recursive:true});
for(const dir of ["js","css","assets"]){const src=path.join(root,dir);if(!fs.existsSync(src))continue;fs.cpSync(src,path.join(out,dir),{recursive:true,filter:(src)=>{const n=path.basename(src);return !["admin.js","admin-app.js","admin-moderation-v2.js"].includes(n) && !n.startsWith("admin-");}});}
cp(path.join(root,"index.html"),path.join(out,"index.html"));
fs.copyFileSync(path.join(root,"service-worker.js"),path.join(out,"service-worker.js"));
fs.writeFileSync(path.join(out,"manifest.json"),JSON.stringify({name:"هویت",short_name:"هویت",start_url:"index.html",display:"standalone",background_color:"#0B1020",theme_color:"#0B1020",icons:[{src:"assets/icons/icon-192.png",sizes:"192x192",type:"image/png"},{src:"assets/icons/icon-512.png",sizes:"512x512",type:"image/png"},{src:"assets/icons/icon-maskable.png",sizes:"512x512",type:"image/png",purpose:"maskable"}]},null,2));
console.log("Messenger dist ready:",out);
