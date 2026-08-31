// Static regression assertions for Hoviyat navigation.
import fs from "node:fs";
const app = fs.readFileSync(new URL("../js/app.js", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../css/hoviyat-phone-final.css", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const assert=(x,m)=>{if(!x) throw new Error(m)};
assert(app.includes('shell.dataset.chatOpen = "1"'), 'chat-open state missing');
assert(app.includes('switchView("secretlist")'), 'secret list central navigation missing');
assert(app.includes('switchView("secretchat")'), 'secret chat central navigation missing');
assert(!app.includes('card.addEventListener("pointerup", open'), 'duplicate pointerup handler remains');
assert(css.includes('#appShell .view[hidden]'), 'hidden override missing');
assert(html.includes('id="view-chat"'), 'view-chat missing');
console.log('NAV-REGRESSION PASS');
