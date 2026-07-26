/**
 * voice.js
 * ضبط پیام صوتی واقعی با MediaRecorder + استخراج واقعی موج صدا (نه تزئینی)
 * با نمونه‌برداری دوره‌ای از AnalyserNode حین ضبط.
 */

export function createVoiceRecorder() {
  let mediaRecorder = null;
  let chunks = [];
  let audioCtx = null;
  let analyser = null;
  let sampleTimer = null;
  let waveform = [];
  let startTime = 0;
  let stream = null;

  async function start() {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    chunks = [];
    waveform = [];
    startTime = Date.now();

    mediaRecorder = new MediaRecorder(stream);
    mediaRecorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
    mediaRecorder.start();

    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioCtx.createMediaStreamSource(stream);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    sampleTimer = setInterval(() => {
      analyser.getByteTimeDomainData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const v = (dataArray[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / dataArray.length); // 0..~1
      waveform.push(Math.min(1, rms * 3));
    }, 120);
  }

  function stop() {
    return new Promise(resolve => {
      if (!mediaRecorder) return resolve(null);
      mediaRecorder.onstop = () => {
        clearInterval(sampleTimer);
        const durationSec = (Date.now() - startTime) / 1000;
        const blob = new Blob(chunks, { type: "audio/webm" });
        stream.getTracks().forEach(t => t.stop());
        audioCtx?.close().catch(() => {});
        resolve({ blob, durationSec, waveform: downsample(waveform, 28) });
      };
      mediaRecorder.stop();
    });
  }

  function cancel() {
    try {
      clearInterval(sampleTimer);
      mediaRecorder?.stop();
      stream?.getTracks().forEach(t => t.stop());
      audioCtx?.close().catch(() => {});
    } catch (e) { /* بی‌اثر */ }
  }

  /** فشرده‌سازی آرایه موج به تعداد ثابت میله برای نمایش یکنواخت */
  function downsample(arr, targetLen) {
    if (arr.length <= targetLen) return arr;
    const factor = arr.length / targetLen;
    const out = [];
    for (let i = 0; i < targetLen; i++) {
      const start = Math.floor(i * factor), end = Math.floor((i + 1) * factor);
      const slice = arr.slice(start, Math.max(end, start + 1));
      out.push(slice.reduce((a, b) => a + b, 0) / slice.length);
    }
    return out;
  }

  return { start, stop, cancel };
}
