/* Hoviyat Media Studio: client-side photo annotation + quick sticker export. */
let modal, canvas, ctx, img, sourceFile, tool="pen", color="#7b61ff", size=6, drawing=false, last=null;
const $=s=>document.querySelector(s);
const history=[];
function ensure(){
  if(modal)return;
  modal=document.createElement("div");
  modal.id="hvMediaEditor";modal.className="modal";modal.hidden=true;
  modal.innerHTML=`<div class="modal-box glass liquid-sheen hv-editor">
    <div class="modal-head"><h3>ویرایش رسانه</h3><button id="hvEdClose" class="icon-btn" aria-label="بستن">×</button></div>
    <div class="hv-editor-stage"><canvas class="hv-editor-canvas" id="hvEdCanvas"></canvas></div>
    <div class="hv-editor-tools">
      <button data-tool="pen" class="active">✏️ قلم</button><button data-tool="marker">🖍 ماژیک</button><button data-tool="blur">🌫 تار</button>
      <button data-tool="eraser">🧽 پاک‌کن</button><button data-tool="text">T متن</button><button data-tool="undo">↶ بازگشت</button>
      <button id="hvEdSticker" class="hv-sticker-btn" type="button">🪄 ساخت استیکر</button>
      <input id="hvEdColor" class="hv-editor-color" type="color" value="#7b61ff"><input id="hvEdSize" type="range" min="2" max="36" value="6">
    </div>
    <div class="hv-editor-actions"><button id="hvEdCancel" class="btn-outline">انصراف</button><button id="hvEdSend" class="btn-primary">اعمال و ارسال</button></div>
    <p id="hvEdHint" class="settings-hint">برای رسم، روی تصویر بکش. «ساخت استیکر» یک PNG با حاشیه سفید می‌سازد.</p>
  </div>`;
  document.body.appendChild(modal);canvas=$("#hvEdCanvas");ctx=canvas.getContext("2d",{willReadFrequently:false});
  $("#hvEdClose").onclick=close;$("#hvEdCancel").onclick=close;$("#hvEdSend").onclick=send;$("#hvEdSticker").onclick=makeSticker;
  $("#hvEdColor").oninput=e=>color=e.target.value;$("#hvEdSize").oninput=e=>size=+e.target.value;
  modal.addEventListener("click",e=>{const b=e.target.closest("[data-tool]");if(!b)return;tool=b.dataset.tool;if(tool==="undo")undo();else{modal.querySelectorAll("[data-tool]").forEach(x=>x.classList.toggle("active",x===b));$("#hvEdHint").textContent=tool==="text"?"برای افزودن متن روی تصویر کلیک کن.":tool==="blur"?"برای تار کردن، روی ناحیه موردنظر بکش.":"برای رسم روی تصویر بکش."}});
  canvas.addEventListener("pointerdown",start,{passive:false});canvas.addEventListener("pointermove",move,{passive:false});canvas.addEventListener("pointerup",end,{passive:false});canvas.addEventListener("pointercancel",end,{passive:false});
}
function pos(e){const r=canvas.getBoundingClientRect();return{x:(e.clientX-r.left)*canvas.width/r.width,y:(e.clientY-r.top)*canvas.height/r.height}}
function start(e){if(!img)return;e.preventDefault();drawing=true;last=pos(e);canvas.setPointerCapture?.(e.pointerId);if(tool==="text"){drawing=false;const t=prompt("متن روی تصویر:");if(t){ctx.font=`700 ${Math.max(18,size*4)}px Vazirmatn,Tahoma,sans-serif`;ctx.fillStyle=color;ctx.fillText(t,last.x,last.y)}snapshot();return}draw(e)}
function move(e){if(!drawing)return;e.preventDefault();draw(e)}
function end(e){if(!drawing)return;e?.preventDefault();drawing=false;last=null;snapshot()}
function draw(e){const p=pos(e);ctx.save();ctx.lineCap="round";ctx.lineJoin="round";ctx.strokeStyle=color;ctx.lineWidth=size;if(tool==="marker"){ctx.globalAlpha=.28;ctx.lineWidth=size*2.5}if(tool==="eraser"){ctx.globalCompositeOperation="destination-out";ctx.lineWidth=size*2.5}if(tool==="blur"){ctx.globalCompositeOperation="source-over";ctx.filter=`blur(${Math.max(4,size)}px)`;ctx.strokeStyle="rgba(160,160,170,.85)"}ctx.beginPath();ctx.moveTo(last.x,last.y);ctx.lineTo(p.x,p.y);ctx.stroke();ctx.restore();last=p}
function snapshot(){if(history.length>=14)history.shift();history.push(canvas.toDataURL("image/png"))}
function undo(){if(history.length<2)return;history.pop();const src=history.at(-1);const x=new Image();x.onload=()=>{ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(x,0,0)};x.src=src}
function open(file){ensure();sourceFile=file;tool="pen";history.length=0;const reader=new FileReader();reader.onload=()=>{img=new Image();img.onload=()=>{const max=1800,scale=Math.min(1,max/Math.max(img.naturalWidth,img.naturalHeight));canvas.width=Math.round(img.naturalWidth*scale);canvas.height=Math.round(img.naturalHeight*scale);ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);snapshot();modal.hidden=false;modal.classList.add("open")};img.src=reader.result};reader.readAsDataURL(file)}
function close(){if(!modal)return;modal.hidden=true;modal.classList.remove("open");sourceFile=null;img=null}
async function canvasFile(name,type="image/jpeg",quality=.92){const blob=await new Promise(r=>canvas.toBlob(r,type,quality));if(!blob)throw new Error("تولید فایل رسانه ناموفق بود.");return new File([blob],name,{type:blob.type})}
async function send(){if(!canvas||!sourceFile)return;const file=await canvasFile(`hoviyat-edit-${Date.now()}.jpg`);window.dispatchEvent(new CustomEvent("hoviyat:edited-media",{detail:{file,original:sourceFile}}));close()}
function removeCornerBackground(c){
  const w=c.width,h=c.height,ox=c.getImageData(0,0,w,h),d=ox.data;
  const seen=new Uint8Array(w*h),q=[];
  const seeds=[0,w-1,(h-1)*w,w*h-1];
  const sample=(idx)=>{const i=idx*4;return [d[i],d[i+1],d[i+2]]};
  const ref=sample(0);const tol=52;
  for(const s of seeds){if(!seen[s]){seen[s]=1;q.push(s)}}
  let head=0;const similar=(idx)=>{const i=idx*4;const dr=d[i]-ref[0],dg=d[i+1]-ref[1],db=d[i+2]-ref[2];return Math.sqrt(dr*dr+dg*dg+db*db)<=tol};
  while(head<q.length){const idx=q[head++];if(!similar(idx))continue;d[idx*4+3]=0;const x=idx%w,y=Math.floor(idx/w);const nb=[];if(x>0)nb.push(idx-1);if(x<w-1)nb.push(idx+1);if(y>0)nb.push(idx-w);if(y<h-1)nb.push(idx+w);for(const n of nb){if(!seen[n]){seen[n]=1;q.push(n)}}}
  c.putImageData(ox,0,0);
}
async function makeSticker(){
  if(!img)return;
  const pad=Math.max(24,Math.round(Math.min(canvas.width,canvas.height)*.06));
  const sc=document.createElement("canvas");sc.width=canvas.width+pad*2;sc.height=canvas.height+pad*2;const sx=sc.getContext("2d");
  sx.clearRect(0,0,sc.width,sc.height);sx.drawImage(canvas,pad,pad);
  try{removeCornerBackground(sc)}catch{}
  // White outline generated from the alpha silhouette.
  const silhouette=document.createElement("canvas");silhouette.width=sc.width;silhouette.height=sc.height;const si=silhouette.getContext("2d");
  si.drawImage(sc,0,0);const alpha=si.getImageData(0,0,sc.width,sc.height);const od=new Uint8ClampedArray(alpha.data.length);for(let i=0;i<alpha.data.length;i+=4){const a=alpha.data[i+3];od[i]=255;od[i+1]=255;od[i+2]=255;od[i+3]=a}si.putImageData(new ImageData(od,sc.width,sc.height),0,0);
  const out=document.createElement("canvas");out.width=sc.width;out.height=sc.height;const ox=out.getContext("2d");for(let y=-6;y<=6;y+=3){for(let x=-6;x<=6;x+=3)ox.drawImage(silhouette,x,y)}ox.drawImage(sc,0,0);
  const blob=await new Promise(r=>out.toBlob(r,"image/png"));if(!blob)throw new Error("تولید استیکر ناموفق بود.");
  const file=new File([blob],`hoviyat-sticker-${Date.now()}.png`,{type:"image/png"});
  window.dispatchEvent(new CustomEvent("hoviyat:edited-media",{detail:{file,original:sourceFile,asSticker:true}}));
  close();
}
window.HoviyatMediaEditor={open,ensure};
