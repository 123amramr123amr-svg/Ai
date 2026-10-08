/* lock.js — قفل التطبيق برمز حماية (يحمي مفاتيح API المحفوظة على الجهاز) */

import { Settings } from './db.js';

const SALT = 'mishkat::v1::';

/* تجزئة الرمز (SHA-256 مع بديل بسيط لو غير متاح) */
export async function hashPin(pin) {
  const raw = SALT + String(pin);
  try {
    if (globalThis.crypto?.subtle) {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
      return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
    }
  } catch { /* نتابع للبديل */ }
  let h1 = 0x811c9dc5, h2 = 0x1000193;
  for (let i = 0; i < raw.length; i++) {
    const c = raw.charCodeAt(i);
    h1 = ((h1 ^ c) * 16777619) >>> 0;
    h2 = ((h2 + c) * 2654435761) >>> 0;
  }
  return 'fb' + h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}

export async function isLockEnabled() {
  return !!(await Settings.get('lockHash', ''));
}

export async function setPin(pin) {
  await Settings.merge({ lockHash: await hashPin(pin), lockEnabled: true });
}

export async function clearPin() {
  await Settings.merge({ lockHash: '', lockEnabled: false });
}

export async function verifyPin(pin) {
  const stored = await Settings.get('lockHash', '');
  if (!stored) return true;
  return (await hashPin(pin)) === stored;
}

export const PIN_LENGTH = 4;

/* إدارة شاشة القفل */
export class LockScreen {
  constructor({ onUnlock } = {}) {
    this.onUnlock = onUnlock;
    this.buffer = '';
    this.el = document.getElementById('lockScreen');
    this.dots = document.getElementById('pinDots');
    this.err = document.getElementById('lockErr');
    this.sub = document.getElementById('lockSub');
    this.attempts = 0;
    this.wire();
  }

  wire() {
    const pad = document.getElementById('keypad');
    if (!pad) return;
    pad.querySelectorAll('button').forEach((b) => {
      b.onclick = () => this.press(b.dataset.k);
    });
    window.addEventListener('keydown', (e) => {
      if (this.el?.hidden) return;
      if (/^[0-9]$/.test(e.key)) this.press(e.key);
      else if (e.key === 'Backspace') this.press('del');
      else if (e.key === 'Enter') this.press('ok');
    });
  }

  paint() {
    [...this.dots.children].forEach((d, i) => d.classList.toggle('on', i < this.buffer.length));
  }

  async show(message) {
    if (!this.el) return;
    this.buffer = '';
    this.paint();
    if (this.err) this.err.textContent = '';
    if (this.sub) this.sub.textContent = message || 'أدخل رمز الحماية للمتابعة';
    this.el.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  hide() {
    if (!this.el) return;
    this.el.hidden = true;
    document.body.style.overflow = '';
    this.buffer = '';
    this.paint();
  }

  async press(k) {
    if (k === 'del') { this.buffer = this.buffer.slice(0, -1); this.paint(); return; }
    if (k === 'ok') { await this.submit(); return; }
    if (this.buffer.length >= PIN_LENGTH) return;
    this.buffer += k;
    this.paint();
    if (this.buffer.length === PIN_LENGTH) setTimeout(() => this.submit(), 130);
  }

  async submit() {
    if (this.buffer.length < PIN_LENGTH) return;
    const ok = await verifyPin(this.buffer);
    if (ok) {
      this.attempts = 0;
      this.hide();
      this.onUnlock?.();
      return;
    }
    this.attempts++;
    this.buffer = '';
    this.paint();
    if (this.err) {
      this.err.textContent = this.attempts >= 3
        ? 'رمز خاطئ — جرّب تاني (لو نسيت الرمز امسح بيانات التطبيق)'
        : 'رمز خاطئ، حاول مرة أخرى';
    }
  }
}
