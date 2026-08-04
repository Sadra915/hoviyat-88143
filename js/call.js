/**
 * call.js
 * تماس صوتی/تصویری یک‌به‌یک با WebRTC.
 *
 * سیگنالینگ (رد و بدل کردن پیشنهاد اتصال/پاسخ/آدرس شبکه) از طریق کانال‌های
 * Broadcast‌ی Supabase Realtime انجام می‌شود — هیچ‌کدام از این پیام‌ها در
 * دیتابیس ذخیره نمی‌شوند، فقط لحظه‌ای بین دو طرف رد و بدل می‌شوند.
 *
 * دو نوع کانال:
 * - call-inbox-<uid>: از لحظه‌ی ورود به اپ همیشه باز است؛ هر جای اپ که باشی
 *   دعوت تماس ورودی از این کانال دریافت می‌شود.
 * - call-session-<callId>: فقط برای طول همان یک تماس مشخص، بین تماس‌گیرنده و
 *   گیرنده، برای رد و بدل SDP/ICE استفاده می‌شود.
 *
 * محدودیت صادقانه: بدون سرور TURN، پشت خیلی از شبکه‌ها (موبایل‌دیتا، VPN،
 * فایروال شرکتی) اتصال مستقیم برقرار نمی‌شود. اینجا از سرور TURN رایگان
 * Metered.ca استفاده شده — پلن رایگانش سقف ماهانه دارد (۵۰۰ مگابایت)؛ اگر
 * تماس‌ها زیاد شدند باید پلن را ارتقا داد یا سرور TURN دیگری جایگزین کرد.
 */
import { supabase, auth } from "./supabase-init.js";

const ICE_SERVERS = [
  { urls: "stun:stun.relay.metered.ca:80" },
  { urls: "turn:global.relay.metered.ca:80", username: "3224dea856f4a2af5573adb9", credential: "Ax4KOLRuXVsq8z39" },
  { urls: "turn:global.relay.metered.ca:80?transport=tcp", username: "3224dea856f4a2af5573adb9", credential: "Ax4KOLRuXVsq8z39" },
  { urls: "turn:global.relay.metered.ca:443", username: "3224dea856f4a2af5573adb9", credential: "Ax4KOLRuXVsq8z39" },
  { urls: "turns:global.relay.metered.ca:443?transport=tcp", username: "3224dea856f4a2af5573adb9", credential: "Ax4KOLRuXVsq8z39" },
];

const RING_TIMEOUT_MS = 45000;

let inboxChannel = null;
let call = null; // { id, otherUid, video, isCaller, sessionChannel, pc, localStream, remoteStream, ringTimer, pendingCandidates }
let handlers = {}; // onIncomingCall, onOutgoing, onConnected, onEnded, onLocalStream, onRemoteStream

function genId() {
  return (crypto.randomUUID && crypto.randomUUID()) || `${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

/** باید یک‌بار بعد از لاگین صدا زده شود — گوش‌دادن دائمی برای تماس ورودی، هرجای اپ که باشی */
export function initCallInbox(h) {
  handlers = h || {};
  const myUid = auth.currentUser.uid;
  inboxChannel = supabase.channel(`call-inbox-${myUid}`, { config: { broadcast: { self: false } } });
  inboxChannel
    .on("broadcast", { event: "invite" }, ({ payload }) => {
      if (call) {
        // همین الان مشغول یه تماس دیگه‌ایم؛ سریع busy بفرست و رد کن
        const busyCh = supabase.channel(`call-session-${payload.callId}`, { config: { broadcast: { self: false } } });
        busyCh.subscribe(status => {
          if (status === "SUBSCRIBED") {
            busyCh.send({ type: "broadcast", event: "busy", payload: {} });
            setTimeout(() => busyCh.unsubscribe(), 1200);
          }
        });
        return;
      }
      handlers.onIncomingCall && handlers.onIncomingCall(payload);
    })
    .subscribe();
  return () => { inboxChannel?.unsubscribe(); inboxChannel = null; };
}

export function isInCall() { return !!call; }

function cleanupCall() {
  if (!call) return;
  clearTimeout(call.ringTimer);
  try { call.pc?.close(); } catch {}
  call.localStream?.getTracks().forEach(t => t.stop());
  try { call.sessionChannel?.unsubscribe(); } catch {}
  call = null;
}

function endCall(reason) {
  const wasInCall = !!call;
  cleanupCall();
  if (wasInCall) handlers.onEnded && handlers.onEnded(reason);
}

/** پایان‌دادن دستی به تماس (چه وصل شده باشد چه هنوز در حال زنگ خوردن) */
export function hangup() {
  if (!call) return;
  try { call.sessionChannel?.send({ type: "broadcast", event: "hangup", payload: {} }); } catch {}
  endCall("local-hangup");
}

/** رد کردن تماس ورودی قبل از قبول‌کردن */
export function declineIncoming(callId, callerUid) {
  const ch = supabase.channel(`call-session-${callId}`, { config: { broadcast: { self: false } } });
  ch.subscribe(status => {
    if (status === "SUBSCRIBED") {
      ch.send({ type: "broadcast", event: "decline", payload: {} });
      setTimeout(() => ch.unsubscribe(), 1200);
    }
  });
}

function attachSignalHandlers(sessionChannel, pc, callId) {
  sessionChannel
    .on("broadcast", { event: "offer" }, async ({ payload }) => {
      if (!call || call.id !== callId) return;
      await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
      flushPendingCandidates(pc);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      sessionChannel.send({ type: "broadcast", event: "answer", payload: { sdp: answer } });
    })
    .on("broadcast", { event: "answer" }, async ({ payload }) => {
      if (!call || call.id !== callId) return;
      await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
      flushPendingCandidates(pc);
    })
    .on("broadcast", { event: "ice" }, ({ payload }) => {
      if (!call || call.id !== callId) return;
      if (!pc.remoteDescription) { call.pendingCandidates.push(payload.candidate); return; }
      pc.addIceCandidate(new RTCIceCandidate(payload.candidate)).catch(() => {});
    })
    .on("broadcast", { event: "decline" }, () => endCall("declined"))
    .on("broadcast", { event: "busy" }, () => endCall("busy"))
    .on("broadcast", { event: "hangup" }, () => endCall("remote-hangup"));
}

function flushPendingCandidates(pc) {
  if (!call) return;
  call.pendingCandidates.forEach(c => pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {}));
  call.pendingCandidates = [];
}

async function createPeerConnection(sessionChannel, callId) {
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  pc.onicecandidate = e => {
    if (e.candidate) sessionChannel.send({ type: "broadcast", event: "ice", payload: { candidate: e.candidate } });
  };
  pc.ontrack = e => {
    if (!call || call.id !== callId) return;
    if (!call.remoteStream) call.remoteStream = new MediaStream();
    call.remoteStream.addTrack(e.track);
    handlers.onRemoteStream && handlers.onRemoteStream(call.remoteStream);
  };
  pc.onconnectionstatechange = () => {
    if (!call || call.id !== callId) return;
    if (pc.connectionState === "connected") {
      clearTimeout(call.ringTimer);
      handlers.onConnected && handlers.onConnected();
    } else if (pc.connectionState === "failed") {
      endCall("failed");
    }
  };
  return pc;
}

/**
 * شروع تماس خروجی.
 * otherInfo باید شامل displayName/username/photoURL خودِ کاربر (نه طرف مقابل)
 * باشد، چون همین را برای نمایش «کی داره زنگ می‌زنه» به طرف مقابل می‌فرستیم.
 */
export async function startCall(otherUid, myInfo, video) {
  if (call) throw new Error("همین الان یه تماس دیگه فعاله");
  const callId = genId();
  const myUid = auth.currentUser.uid;

  let localStream;
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: !!video });
  } catch {
    throw new Error("دسترسی به میکروفون/دوربین داده نشد.");
  }

  const sessionChannel = supabase.channel(`call-session-${callId}`, { config: { broadcast: { self: false } } });
  call = {
    id: callId, otherUid, video: !!video, isCaller: true, sessionChannel,
    pc: null, localStream, remoteStream: null, ringTimer: null, pendingCandidates: [],
  };
  handlers.onLocalStream && handlers.onLocalStream(localStream);

  const pc = await createPeerConnection(sessionChannel, callId);
  call.pc = pc;
  localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
  attachSignalHandlers(sessionChannel, pc, callId);

  sessionChannel
    .on("broadcast", { event: "accept" }, async () => {
      if (!call || call.id !== callId) return;
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      sessionChannel.send({ type: "broadcast", event: "offer", payload: { sdp: offer } });
    })
    .subscribe(async status => {
      if (status !== "SUBSCRIBED") return;
      // دعوت رو به صندوق ورودی طرف مقابل می‌فرستیم (کانال جدا و یک‌بار‌مصرف)
      const inviteCh = supabase.channel(`call-inbox-${otherUid}`, { config: { broadcast: { self: false } } });
      inviteCh.subscribe(st => {
        if (st === "SUBSCRIBED") {
          inviteCh.send({
            type: "broadcast", event: "invite",
            payload: { callId, callerUid: myUid, callerInfo: myInfo, video: !!video },
          });
          setTimeout(() => inviteCh.unsubscribe(), 1500);
        }
      });
    });

  call.ringTimer = setTimeout(() => endCall("no-answer"), RING_TIMEOUT_MS);
  return callId;
}

/** قبول‌کردن تماس ورودی (payload همان چیزیه که onIncomingCall داد) */
export async function acceptCall(payload) {
  if (call) throw new Error("همین الان یه تماس دیگه فعاله");
  const { callId, callerUid, video } = payload;

  let localStream;
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: !!video });
  } catch {
    declineIncoming(callId, callerUid);
    throw new Error("دسترسی به میکروفون/دوربین داده نشد.");
  }

  const sessionChannel = supabase.channel(`call-session-${callId}`, { config: { broadcast: { self: false } } });
  call = {
    id: callId, otherUid: callerUid, video: !!video, isCaller: false, sessionChannel,
    pc: null, localStream, remoteStream: null, ringTimer: null, pendingCandidates: [],
  };
  handlers.onLocalStream && handlers.onLocalStream(localStream);

  const pc = await createPeerConnection(sessionChannel, callId);
  call.pc = pc;
  localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
  attachSignalHandlers(sessionChannel, pc, callId);

  sessionChannel.subscribe(status => {
    if (status === "SUBSCRIBED") sessionChannel.send({ type: "broadcast", event: "accept", payload: {} });
  });

  call.ringTimer = setTimeout(() => endCall("timeout"), RING_TIMEOUT_MS);
}

export function toggleMute() {
  if (!call?.localStream) return false;
  const track = call.localStream.getAudioTracks()[0];
  if (!track) return false;
  track.enabled = !track.enabled;
  return !track.enabled; // true یعنی الان میوته
}

export function toggleCamera() {
  if (!call?.localStream) return false;
  const track = call.localStream.getVideoTracks()[0];
  if (!track) return false;
  track.enabled = !track.enabled;
  return !track.enabled; // true یعنی الان دوربین خاموشه
}
