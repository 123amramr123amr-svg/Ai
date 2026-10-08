/* media.js — استقبال الملفات والوسائط، ضغط الصور، التسجيل الصوتي */

import { Assets } from './db.js';
import { blobToDataURL, isTextLike, fileIcon, uid, nativeApp } from './util.js';

export const MAX_TEXT_READ = 400 * 1024;      // أقصى حجم لقراءة ملف كنص
export const MAX_INLINE = 18 * 1024 * 1024;   // أقصى حجم للإرسال كـ base64

export function kindOf(file) {
  const t = file.type || '';
  if (t.startsWith('image/')) return 'image';
  if (t.startsWith('video/')) return 'video';
  if (t.startsWith('audio/')) return 'audio';
  return 'file';
}

/* تصغير الصور الكبيرة لتقليل التكلفة وحجم الإرسال */
export async function compressImage(file, { maxSide = 1600, quality = 0.85 } = {}) {
  if (!file.type?.startsWith('image/') || file.type === 'image/gif') return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    if (scale >= 1 && file.size < 900 * 1024) return file;
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', quality));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch { return file; }
}

/* ملف → مرفق جاهز للعرض والإرسال (يُخزَّن محليًا في الجهاز) */
export async function fileToAttachment(file, { compress = true } = {}) {
  let f = file;
  const kind = kindOf(file);
  if (compress && kind === 'image') f = await compressImage(file);

  const rec = await Assets.put(f, { name: f.name || 'file', type: f.type, kind });
  const att = {
    id: uid('att'),
    assetId: rec.id,
    kind,
    name: f.name || 'ملف',
    mime: f.type || 'application/octet-stream',
    size: f.size,
    icon: fileIcon(f.type, f.name),
    dataUrl: '',
    text: '',
  };

  if (kind === 'image' || kind === 'video' || kind === 'audio') {
    if (f.size <= MAX_INLINE) att.dataUrl = await blobToDataURL(f);
    else att.tooBig = true;
  }
  if (isTextLike(f.type, f.name) && f.size <= MAX_TEXT_READ) {
    try { att.text = await f.text(); } catch {}
  }
  return att;
}

/* استرجاع blob من التخزين (لإعادة الإرسال أو العرض لاحقًا) */
export async function attachmentDataUrl(att) {
  if (att.dataUrl) return att.dataUrl;
  if (!att.assetId) return '';
  const rec = await Assets.get(att.assetId);
  if (!rec?.blob) return '';
  const url = await blobToDataURL(rec.blob);
  att.dataUrl = url;
  return url;
}

export async function attachmentBlob(att) {
  if (att.assetId) {
    const rec = await Assets.get(att.assetId);
    if (rec?.blob) return rec.blob;
  }
  return null;
}

/* عرض مرفق داخل الرسالة */
export async function attachmentObjectUrl(att) {
  const blob = await attachmentBlob(att);
  if (!blob) return att.dataUrl || '';
  return URL.createObjectURL(blob);
}

/* ------------------- التسجيل الصوتي ------------------- */
export class VoiceRecorder {
  constructor() {
    this.mediaRecorder = null;
    this.chunks = [];
    this.stream = null;
    this.startedAt = 0;
  }

  get supported() { return !!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder); }

  async start() {
    if (!this.supported) throw new Error('التسجيل الصوتي غير مدعوم في هذا المتصفح');
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find((m) => MediaRecorder.isTypeSupported?.(m)) || '';
    this.mediaRecorder = new MediaRecorder(this.stream, mime ? { mimeType: mime } : undefined);
    this.chunks = [];
    this.mediaRecorder.ondataavailable = (e) => { if (e.data?.size) this.chunks.push(e.data); };
    this.mediaRecorder.start(250);
    this.startedAt = Date.now();
    return true;
  }

  stop() {
    return new Promise((resolve) => {
      const mr = this.mediaRecorder;
      if (!mr) return resolve(null);
      mr.onstop = () => {
        const type = mr.mimeType || 'audio/webm';
        const blob = new Blob(this.chunks, { type });
        const secs = Math.round((Date.now() - this.startedAt) / 1000);
        this.cleanup();
        resolve({ blob, secs, type });
      };
      try { mr.stop(); } catch { this.cleanup(); resolve(null); }
    });
  }

  cancel() {
    try { this.mediaRecorder?.stop(); } catch {}
    this.cleanup();
  }

  cleanup() {
    try { this.stream?.getTracks().forEach((t) => t.stop()); } catch {}
    this.stream = null; this.mediaRecorder = null; this.chunks = [];
  }
}

/* هل يمكن تشغيل الصوت؟ (تحويل النص إلى كلام) */
export const ttsSupported = () => {
  const n = nativeApp();
  if (n && typeof n.speak === 'function') return true;
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
};

export function speak(text, { lang = 'ar-SA', rate = 1, onEnd } = {}) {
  const native = nativeApp();
  if (native && typeof native.speak === 'function') {
    try { native.speak(String(text)); if (onEnd) setTimeout(onEnd, 1200); return null; } catch { /* نتابع */ }
  }
  if (!ttsSupported()) throw new Error('قراءة النص غير مدعومة في هذا المتصفح');
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(String(text).slice(0, 4000));
  u.lang = lang; u.rate = rate;
  const voices = speechSynthesis.getVoices();
  const ar = voices.find((v) => v.lang?.startsWith('ar'));
  if (ar) u.voice = ar;
  if (onEnd) u.onend = onEnd;
  speechSynthesis.speak(u);
  return u;
}

export function stopSpeaking() {
  const n = nativeApp();
  if (n && typeof n.stopSpeaking === 'function') { try { n.stopSpeaking(); } catch {} }
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) speechSynthesis.cancel();
}
