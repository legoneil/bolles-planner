// Friend invites: a link like …/#/add/K7QM4XRT/Neil that opens the planner
// with "Add Neil as a friend?". The code is the inviter's private friend
// code; the name in the link is only for display (the real name comes back
// from the server when the request is sent). If the person isn't set up or
// signed in yet, the invite waits in localStorage until they are.

import qrcode from './vendor/qrcode.mjs';

const KEY = 'bolles-planner:invite';
const MAX_AGE = 14 * 24 * 3600 * 1000;
export const CODE = /^[A-HJ-NP-Z2-9]{8}$/;

export const cleanCode = (s) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

export function inviteLink(code, name) {
  const first = String(name ?? '').trim().split(/\s+/)[0] ?? '';
  return `${location.origin}${location.pathname}#/add/${code}${first ? `/${encodeURIComponent(first.slice(0, 30))}` : ''}`;
}

// From the hash parts after "add": [code, name?]
export function parseInvite(code, name) {
  let display = '';
  try {
    display = decodeURIComponent(name ?? '').replace(/[^\p{L}\p{N} .'-]/gu, '').slice(0, 30);
  } catch {
    display = '';
  }
  return { code: cleanCode(code), name: display };
}

export function savePendingInvite(invite) {
  if (!CODE.test(invite.code)) return;
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...invite, at: Date.now() }));
  } catch {
    // Private mode: the invite still works if they finish setup now.
  }
}

export function pendingInvite() {
  try {
    const inv = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (inv && CODE.test(inv.code) && Date.now() - inv.at < MAX_AGE) return inv;
  } catch {
    // ignore
  }
  return null;
}

export function clearPendingInvite() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

export const inviteHash = (inv) => `#/add/${inv.code}${inv.name ? `/${encodeURIComponent(inv.name)}` : ''}`;

// The link as a QR code, drawn in the current text color.
export function qrSvg(text) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  let path = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) path += `M${c} ${r}h1v1h-1z`;
  return `<svg class="qr" viewBox="-4 -4 ${n + 8} ${n + 8}" role="img" aria-label="QR code for your invite link"><rect x="-4" y="-4" width="${n + 8}" height="${n + 8}" fill="#fff"/><path d="${path}" fill="#0f1626"/></svg>`;
}
