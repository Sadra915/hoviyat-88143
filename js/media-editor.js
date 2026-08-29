/* HOVIYAT Media Editor: client-side photo markup before upload. */
let modal,canvas,ctx,img,sourceFile,tool="pen",color="#ff6d00",size=6,drawing=false,last=null;
const $=s=>document.querySelector(s);
function ensure(){
 if(modal)return;
 modal=document.createElement("div");modal.id="hvMediaEditor";modal.className="modal";modal.hidden=true;
 modal.innerHTML=`<div class="modal-box glass liquid-sheen hv-editor"><div class="modal-head"><h3>ویرایش رسانه</h3><button id="hvEdClose" class="icon-btn">×</button></div><div class="hv-editor-stage"><canvas class="hv-editor-canvas" id="hvEdCanvas"></canvas></div><div class="hv-editor-tools"><button data-tool="pen" class="active">✏️ قلم</button><button data-tool="marker">🖍 ماژیک</button><button data-tool="blur">🌫 تار</button><button data-tool="eraser">🧽 پاک‌کن</button><button data-tool="text">T متن</button><button data-tool="undo">↶ بازگشت</button><input id="hvEdColor" class="hv-editor-color" type="color" value="#ff6d00"><input id="hvEdSize" type="range" min="2" max="36" value="6"></div><div class="hv-editor-actions"><button id="hvEdCancel" class="btn-outline">انصراف</button><button id="hvEdSend" class="btn-primary">اعمال و ارسال</button></div><p id="hvEdHint" class="settings-hint">برای تار کردن، روی ناحیه موردنظر بکش.</p></div>`;
 document.body.appendChild(modal);canvas=$("#hvEdCanvas");ctx=canvas.getContext("2d");
 $("#hvEdClose").onclick=close;$("#hvEdCancel").onclick=close;$("#hvEdSend").onclick=send;
 $("#hvEdColor").oninput=e=>color=e.target.value;$("#hvEdSize").oninput=e=>size=+e.target.value;
 modal.addEventListener("click",e=>{const b=e.target.closest("[data-tool]");if(!b)return;tool=b.dataset.tool;if(tool==="undo")undo();else{modal.querySelectorAll("[data-tool]").forEach(x=>x.classList.toggle("active",x===b));$("#hvEdHint").textContent=tool==="text"?"روی تصویر کلیک کن و متن کوتاه وارد کن.":tool==="blur"?"برای تار کردن، روی ناحیه موردنظر بکش.":"برای رسم روی تصویر بکش."}});
 canvas.addEventListener("pointerdown",start);canvas.addEventListener("pointermove",move);canvas.addEventListener("pointerup",end);canvas.addEventListener("pointercancel",end);
}
const pos=e=>{const r=canvas.getBoundingClientRect();return{x:(e.clientX-r.left)*canvas.width/r.width,y:(e.clientY-r.top)*canvas.height/r.height}}
function start(e){if(!img)return;drawing=true;last=pos(e);canvas.setPointerCapture?.(e.pointerId);if(tool==="text"){drawing=false;const t=prompt("متن روی تصویر:");if(t){ctx.font=`700 ${Math.max(18,size*4)}px Vazirmatn,Tahoma,sans-serif`;ctx.fillStyle=color;ctx.fillText(t,last.x,last.y)};snapshot();return}draw(e)}
function move(e){if(!drawing)return;draw(e)}
function end(){if(!drawing)return;drawing=false;last=null;snapshot()}
function draw(e){const p=pos(e);ctx.save();ctx.lineCap="round";ctx.lineJoin="round";ctx.strokeStyle=color;ctx.lineWidth=size;
 if(tool==="marker"){ctx.globalAlpha=.28;ctx.lineWidth=size*2.5}
 if(tool==="eraser"){ctx.globalCompositeOperation="destination-out";ctx.lineWidth=size*2.5}
 if(tool==="blur"){ctx.globalCompositeOperation="source-over";ctx.filter=`blur(${Math.max(4,size)}px)`;ctx.strokeStyle="rgba(150,150,150,.8)"}
 ctx.beginPath();ctx.moveTo(last.x,last.y);ctx.lineTo(p.x,p.y);ctx.stroke();ctx.restore();last=p}
const history=[];function snapshot(){if(history.length>12)history.shift();history.push(canvas.toDataURL("image/png"))}
function undo(){const src=history.at(-2);if(!src)return;history.pop();const x=new Image();x.onload=()=>{ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(x,0,0)};x.src=src}
function open(file){ensure();sourceFile=file;tool="pen";history.length=0;const reader=new FileReader();reader.onload=()=>{img=new Image();img.onload=()=>{const max=1800,scale=Math.min(1,max/Math.max(img.naturalWidth,img.naturalHeight));canvas.width=Math.round(img.naturalWidth*scale);canvas.height=Math.round(img.naturalHeight*scale);ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);snapshot();modal.hidden=false;modal.classList.add("open")};img.src=reader.result};reader.readAsDataURL(file)}
function close(){if(!modal)return;modal.hidden=true;modal.classList.remove("open");sourceFile=null;img=null}
async function send(){if(!canvas||!sourceFile)return;const blob=await new Promise(r=>canvas.toBlob(r,"image/jpeg",.92));const ext=(sourceFile.name.match(/\.[^.]+$/)||[".jpg"])[0];const edited=new File([blob],`hoviyat-edit-${Date.now()}${ext.toLowerCase()===".png"?".jpg":ext}`,{type:"image/jpeg"});window.dispatchEvent(new CustomEvent("hoviyat:edited-media",{detail:{file:edited,original:sourceFile}}));close()}
window.HoviyatMediaEditor={open,ensure};
