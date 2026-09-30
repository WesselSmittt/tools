"use strict";

// Alles draait lokaal in de browser; er gaat niets naar een server.

const $ = (id) => document.getElementById(id);
const enc = new TextEncoder();
const decStrict = new TextDecoder("utf-8", { fatal: true });

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function msg(el, type, text) {
  el.innerHTML = text ? `<div class="msg ${type}">${escapeHtml(text)}</div>` : "";
}

function kv(el, rows) {
  el.innerHTML = rows
    .map(([k, v, copy]) => `<dt>${escapeHtml(k)}</dt><dd><span>${escapeHtml(v)}</span>${copy ? `<button class="btn ghost small" type="button" data-copy-text="${escapeHtml(v)}">kopieer</button>` : ""}</dd>`)
    .join("");
}

// ---------- Bytes & encodings ----------

function bytesToB64(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

function b64ToBytes(s) {
  s = s.replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

const b64url = (bytes) => bytesToB64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const toHex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

function hexToBytes(s) {
  s = s.replace(/0x/gi, "").replace(/[\s:,-]/g, "");
  if (s.length % 2 || /[^0-9a-f]/i.test(s)) throw new Error("Ongeldige hex-invoer");
  return Uint8Array.from(s.match(/../g) || [], (h) => parseInt(h, 16));
}

function bytesToText(bytes) {
  try {
    return decStrict.decode(bytes);
  } catch {
    throw new Error("Resultaat is geen geldige UTF-8-tekst (waarschijnlijk binaire data)");
  }
}

// ---------- MD5 (zit niet in WebCrypto) ----------

const MD5_K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0);
const MD5_S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];

function md5(bytes) {
  const len = bytes.length;
  const blocks = ((len + 8) >>> 6) + 1;
  const buf = new Uint8Array(blocks * 64);
  buf.set(bytes);
  buf[len] = 0x80;
  const view = new DataView(buf.buffer);
  view.setUint32(buf.length - 8, (len * 8) >>> 0, true);
  view.setUint32(buf.length - 4, Math.floor(len / 2 ** 29), true);

  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
  const M = new Array(16);

  for (let off = 0; off < buf.length; off += 64) {
    for (let i = 0; i < 16; i++) M[i] = view.getUint32(off + i * 4, true);
    let A = a0, B = b0, C = c0, D = d0;
    for (let j = 0; j < 64; j++) {
      let F, g;
      if (j < 16) { F = (B & C) | (~B & D); g = j; }
      else if (j < 32) { F = (D & B) | (~D & C); g = (5 * j + 1) % 16; }
      else if (j < 48) { F = B ^ C ^ D; g = (3 * j + 5) % 16; }
      else { F = C ^ (B | ~D); g = (7 * j) % 16; }
      F = (F + A + MD5_K[j] + M[g]) >>> 0;
      A = D; D = C; C = B;
      const s = MD5_S[(j >> 4) * 4 + (j % 4)];
      B = (B + ((F << s) | (F >>> (32 - s)))) >>> 0;
    }
    a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0; c0 = (c0 + C) >>> 0; d0 = (d0 + D) >>> 0;
  }

  const out = new Uint8Array(16);
  const ov = new DataView(out.buffer);
  [a0, b0, c0, d0].forEach((w, i) => ov.setUint32(i * 4, w, true));
  return toHex(out);
}

// ---------- Kopiëren ----------

document.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-copy], [data-copy-text]");
  if (!btn) return;
  let text = btn.dataset.copyText;
  if (text === undefined) {
    const el = $(btn.dataset.copy);
    text = "value" in el ? el.value : el.textContent;
  }
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    const old = btn.textContent;
    btn.textContent = "✓ gekopieerd";
    setTimeout(() => (btn.textContent = old), 1200);
  } catch {
    /* klembord niet beschikbaar */
  }
});

// ---------- Router ----------

const tools = document.querySelectorAll(".tool");

function route() {
  const name = location.hash.slice(1);
  const tool = document.querySelector(`.tool[data-tool="${CSS.escape(name)}"]`);
  $("view-home").hidden = !!tool;
  tools.forEach((t) => (t.hidden = t !== tool));
  $("nav-path").textContent = tool ? `/ TOOLS / ${name.toUpperCase()}` : "/ TOOLS";
  const back = $("nav-back");
  back.href = tool ? "#" : "https://wesselsmit.com/";
  back.textContent = tool ? "← tools" : "← portfolio";
  document.title = tool ? `${tool.dataset.title} · Tools · Wessel Smit` : "Tools · Wessel Smit";
  window.scrollTo(0, 0);
  if (tool) tool.querySelector("textarea, input[type=text], input[type=password]")?.focus({ preventScroll: true });
}

window.addEventListener("hashchange", route);
$("year").textContent = new Date().getFullYear();

// ================= JWT =================

const jwtIn = $("jwt-in");
const jwtSecret = $("jwt-secret");
const HMAC = { HS256: "SHA-256", HS384: "SHA-384", HS512: "SHA-512" };
const rtf = new Intl.RelativeTimeFormat("nl", { numeric: "auto" });
const dtf = new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium", timeStyle: "medium" });

function relative(date) {
  const s = Math.round((date - Date.now()) / 1000);
  const units = [["year", 31536000], ["month", 2592000], ["day", 86400], ["hour", 3600], ["minute", 60], ["second", 1]];
  for (const [unit, size] of units) {
    if (Math.abs(s) >= size || unit === "second") return rtf.format(Math.round(s / size), unit);
  }
}

async function hmacSign(alg, secret, data) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: HMAC[alg] }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}

let jwtParsed = null;

function decodeJwt() {
  const token = jwtIn.value.trim().replace(/^Bearer\s+/i, "");
  const msgs = $("jwt-msgs");
  jwtParsed = null;
  $("jwt-header").textContent = "";
  $("jwt-payload").textContent = "";
  $("jwt-claims").innerHTML = "";
  $("jwt-colored").innerHTML = "";
  msg(msgs);

  if (!token) return verifyJwt();

  const parts = token.split(".");
  if (parts.length !== 3) {
    msg(msgs, "err", `Een JWT heeft 3 delen gescheiden door punten, dit token heeft er ${parts.length}.`);
    return verifyJwt();
  }

  $("jwt-colored").innerHTML = `<span class="c-header">${escapeHtml(parts[0])}</span>.<span class="c-payload">${escapeHtml(parts[1])}</span>.<span class="c-sig">${escapeHtml(parts[2])}</span>`;

  let header, payload;
  try {
    header = JSON.parse(bytesToText(b64ToBytes(parts[0])));
    payload = JSON.parse(bytesToText(b64ToBytes(parts[1])));
  } catch {
    msg(msgs, "err", "Header of payload is geen geldige Base64URL-gecodeerde JSON.");
    return verifyJwt();
  }

  jwtParsed = { parts, header, payload };
  $("jwt-header").textContent = JSON.stringify(header, null, 2);
  $("jwt-payload").textContent = JSON.stringify(payload, null, 2);

  const rows = [];
  const warnings = [];
  const now = Date.now();
  for (const [claim, label] of [["iat", "Uitgegeven (iat)"], ["nbf", "Geldig vanaf (nbf)"], ["exp", "Verloopt (exp)"]]) {
    if (typeof payload[claim] === "number") {
      const d = new Date(payload[claim] * 1000);
      rows.push([label, `${dtf.format(d)} (${relative(d)})`]);
    }
  }
  kv($("jwt-claims"), rows);

  if (String(header.alg).toLowerCase() === "none") warnings.push(["err", "alg is \"none\": dit token heeft geen handtekening en is niet te vertrouwen."]);
  if (typeof payload.exp === "number" && payload.exp * 1000 < now) warnings.push(["warn", "Dit token is verlopen."]);
  if (typeof payload.nbf === "number" && payload.nbf * 1000 > now) warnings.push(["warn", "Dit token is nog niet geldig (nbf ligt in de toekomst)."]);
  if (typeof payload.exp !== "number") warnings.push(["warn", "Geen exp-claim: dit token verloopt nooit."]);
  msgs.innerHTML = warnings.map(([t, m]) => `<div class="msg ${t}">${escapeHtml(m)}</div>`).join("");

  verifyJwt();
}

async function verifyJwt() {
  const out = $("jwt-verify");
  if (!jwtParsed) return msg(out);
  const { parts, header } = jwtParsed;
  if (!HMAC[header.alg]) {
    return msg(out, "warn", header.alg && header.alg !== "none" ? `Verificatie werkt hier alleen voor HMAC (HS256/384/512), niet voor ${header.alg}.` : "");
  }
  if (!jwtSecret.value) return msg(out, "warn", "Vul het secret in om de handtekening te controleren.");
  const expected = b64url(await hmacSign(header.alg, jwtSecret.value, `${parts[0]}.${parts[1]}`));
  if (expected === parts[2]) msg(out, "ok", "✓ Handtekening klopt met dit secret.");
  else msg(out, "err", "✗ Handtekening klopt niet met dit secret.");
}

$("jwt-sample").addEventListener("click", async () => {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(enc.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const payload = b64url(enc.encode(JSON.stringify({ sub: "1234567890", name: "Wessel Smit", role: "student", iat: now, exp: now + 3600 })));
  const secret = "your-256-bit-secret";
  const sig = b64url(await hmacSign("HS256", secret, `${header}.${payload}`));
  jwtIn.value = `${header}.${payload}.${sig}`;
  jwtSecret.value = secret;
  decodeJwt();
});

jwtIn.addEventListener("input", decodeJwt);
jwtSecret.addEventListener("input", verifyJwt);

// ================= Encoder =================

const CODECS = {
  b64: {
    encode: (s) => bytesToB64(enc.encode(s)),
    decode: (s) => bytesToText(b64ToBytes(s)),
  },
  b64url: {
    encode: (s) => b64url(enc.encode(s)),
    decode: (s) => bytesToText(b64ToBytes(s)),
  },
  hex: {
    encode: (s) => toHex(enc.encode(s)),
    decode: (s) => bytesToText(hexToBytes(s)),
  },
  url: {
    encode: (s) => encodeURIComponent(s),
    decode: (s) => decodeURIComponent(s.replace(/\+/g, " ")),
  },
  html: {
    encode: (s) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])),
    decode: (s) => {
      const t = document.createElement("textarea");
      t.innerHTML = s;
      return t.value;
    },
  },
  bin: {
    encode: (s) => Array.from(enc.encode(s), (b) => b.toString(2).padStart(8, "0")).join(" "),
    decode: (s) => {
      const bits = s.replace(/\s+/g, "");
      if (!bits || bits.length % 8 || /[^01]/.test(bits)) throw new Error("Binair moet bestaan uit groepjes van 8 bits (0 en 1)");
      return bytesToText(Uint8Array.from(bits.match(/.{8}/g), (b) => parseInt(b, 2)));
    },
  },
  rot13: {
    encode: (s) => s.replace(/[a-z]/gi, (c) => {
      const base = c <= "Z" ? 65 : 97;
      return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base);
    }),
    decode: (s) => CODECS.rot13.encode(s),
  },
};

function runCodec(direction) {
  const out = $("enc-out");
  try {
    out.value = CODECS[$("enc-mode").value][direction]($("enc-in").value);
    msg($("enc-msg"));
  } catch (err) {
    out.value = "";
    msg($("enc-msg"), "err", err instanceof URIError ? "Ongeldige URL-codering" : err.message.includes("atob") || err.name === "InvalidCharacterError" ? "Ongeldige Base64-invoer" : err.message);
  }
}

$("enc-encode").addEventListener("click", () => runCodec("encode"));
$("enc-decode").addEventListener("click", () => runCodec("decode"));
$("enc-swap").addEventListener("click", () => {
  $("enc-in").value = $("enc-out").value;
  $("enc-out").value = "";
  msg($("enc-msg"));
});

// ================= Hash =================

const HASHES = ["MD5", "SHA-1", "SHA-256", "SHA-384", "SHA-512"];
let hashBytes = new Uint8Array();
let hashResults = {};
let hashRun = 0;

async function computeHashes() {
  const run = ++hashRun;
  const results = {};
  for (const name of HASHES) {
    results[name] = name === "MD5" ? md5(hashBytes) : toHex(new Uint8Array(await crypto.subtle.digest(name, hashBytes)));
  }
  if (run !== hashRun) return; // nieuwere invoer is al onderweg
  hashResults = results;
  $("hash-out").innerHTML = HASHES.map((name) => `
    <div>
      <div class="label"><span>${name}${name === "MD5" || name === "SHA-1" ? ' <span style="color: var(--amber)">(niet meer veilig)</span>' : ""}</span>
        <button class="btn ghost small" type="button" data-copy-text="${results[name]}">kopieer</button></div>
      <div class="out">${results[name]}</div>
    </div>`).join("");
  compareHash();
}

function compareHash() {
  const want = $("hash-cmp").value.trim().toLowerCase();
  if (!want) return msg($("hash-cmp-msg"));
  const hit = HASHES.find((n) => hashResults[n] === want);
  if (hit) msg($("hash-cmp-msg"), "ok", `✓ Komt overeen (${hit})`);
  else msg($("hash-cmp-msg"), "err", "✗ Komt met geen enkele hash overeen");
}

$("hash-in").addEventListener("input", () => {
  hashBytes = enc.encode($("hash-in").value);
  $("hash-src").textContent = "";
  $("hash-file").value = "";
  computeHashes();
});

$("hash-file").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  $("hash-in").value = "";
  $("hash-src").textContent = `${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
  hashBytes = new Uint8Array(await file.arrayBuffer());
  computeHashes();
});

$("hash-cmp").addEventListener("input", compareHash);
computeHashes();

// ================= Subnet =================

const ipToStr = (n) => [24, 16, 8, 0].map((s) => (n >>> s) & 255).join(".");
const ipToBin = (n) => n.toString(2).padStart(32, "0");

function parseIp(s) {
  const m = s.trim().match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  const o = m.slice(1).map(Number);
  if (o.some((x) => x > 255)) return null;
  return ((o[0] << 24) | (o[1] << 16) | (o[2] << 8) | o[3]) >>> 0;
}

function maskToPrefix(mask) {
  const bin = ipToBin(mask);
  return /^1*0*$/.test(bin) ? bin.indexOf("0") === -1 ? 32 : bin.indexOf("0") : null;
}

function ipType(ip) {
  const inNet = (net, p) => (ip & ((0xffffffff << (32 - p)) >>> 0)) >>> 0 === parseIp(net);
  if (inNet("10.0.0.0", 8) || inNet("172.16.0.0", 12) || inNet("192.168.0.0", 16)) return "Privé (RFC 1918)";
  if (inNet("127.0.0.0", 8)) return "Loopback";
  if (inNet("169.254.0.0", 16)) return "Link-local (APIPA)";
  if (inNet("100.64.0.0", 10)) return "Carrier-grade NAT (RFC 6598)";
  if (inNet("224.0.0.0", 4)) return "Multicast";
  if (inNet("240.0.0.0", 4)) return "Gereserveerd";
  if (inNet("0.0.0.0", 8)) return "\"Dit netwerk\" (0.0.0.0/8)";
  return "Publiek";
}

function ipClass(ip) {
  const a = ip >>> 24;
  if (a < 128) return "A";
  if (a < 192) return "B";
  if (a < 224) return "C";
  if (a < 240) return "D (multicast)";
  return "E (experimenteel)";
}

function calcSubnet(fromRange) {
  const input = $("sub-in");
  const out = $("sub-out");
  const raw = input.value.trim();
  const [ipPart, rest] = raw.split(/\s*\/\s*|\s+/);
  const ip = parseIp(ipPart || "");
  let prefix = Number($("sub-range").value);

  if (fromRange && ip !== null) {
    input.value = `${ipToStr(ip)}/${prefix}`;
  } else if (rest !== undefined && rest !== "") {
    if (/^\d{1,2}$/.test(rest) && Number(rest) <= 32) prefix = Number(rest);
    else {
      const m = parseIp(rest);
      const p = m === null ? null : maskToPrefix(m);
      if (p === null) {
        out.innerHTML = "";
        $("sub-bin").innerHTML = "";
        return msg($("sub-msg"), "err", "Ongeldige prefix of subnetmasker");
      }
      prefix = p;
    }
  }

  if (ip === null) {
    out.innerHTML = "";
    $("sub-bin").innerHTML = "";
    return msg($("sub-msg"), "err", "Ongeldig IPv4-adres");
  }
  msg($("sub-msg"));

  $("sub-range").value = prefix;
  $("sub-prefix").textContent = "/" + prefix;

  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  const network = (ip & mask) >>> 0;
  const broadcast = (network | ~mask) >>> 0;
  const total = 2 ** (32 - prefix);
  const usable = prefix === 32 ? 1 : prefix === 31 ? 2 : total - 2;
  const first = prefix >= 31 ? network : network + 1;
  const last = prefix >= 31 ? broadcast : broadcast - 1;

  kv(out, [
    ["Netwerk", `${ipToStr(network)}/${prefix}`, true],
    ["Subnetmasker", ipToStr(mask), true],
    ["Wildcard", ipToStr(~mask >>> 0), true],
    ["Broadcast", prefix >= 31 ? "– (geen, /" + prefix + ")" : ipToStr(broadcast)],
    ["Eerste host", ipToStr(first)],
    ["Laatste host", ipToStr(last)],
    ["Bruikbare hosts", usable.toLocaleString("nl-NL")],
    ["Totaal adressen", total.toLocaleString("nl-NL")],
    ["Klasse", ipClass(ip)],
    ["Type", ipType(ip)],
    ["Hex", "0x" + ip.toString(16).padStart(8, "0").toUpperCase()],
  ]);

  const bits = ipToBin(ip);
  const colored = Array.from(bits, (b, i) => `<span class="${i < prefix ? "net" : "host"}">${b}</span>${i % 8 === 7 && i < 31 ? "." : ""}`).join("");
  $("sub-bin").innerHTML = `<div class="label">Binair (<span style="color: var(--accent)">netwerk</span> / <span style="color: var(--cyan)">host</span>)</div>${colored}`;
}

$("sub-in").addEventListener("input", () => calcSubnet(false));
$("sub-range").addEventListener("input", () => calcSubnet(true));
calcSubnet(false);

// ================= Wachtwoorden =================

const SETS = {
  lower: "abcdefghijklmnopqrstuvwxyz",
  upper: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  digits: "0123456789",
  symbols: "!@#$%^&*()-_=+[]{};:,.<>?/~",
};
const AMBIGUOUS = /[0O1lI]/g;

function randomInt(n) {
  // Rejection sampling, zodat elk teken precies even vaak kans heeft
  const limit = Math.floor(2 ** 32 / n) * n;
  const buf = new Uint32Array(1);
  do crypto.getRandomValues(buf); while (buf[0] >= limit);
  return buf[0] % n;
}

function generatePassword() {
  const len = Number($("pw-len").value);
  const noAmbig = $("pw-ambig").checked;
  const chosen = Object.keys(SETS)
    .filter((k) => $("pw-" + k).checked)
    .map((k) => (noAmbig ? SETS[k].replace(AMBIGUOUS, "") : SETS[k]));

  if (!chosen.length) {
    $("pw-out").textContent = "Kies minstens één tekensoort";
    return;
  }

  const pool = chosen.join("");
  let pw;
  // Opnieuw tot elke gekozen tekensoort erin zit
  do {
    pw = Array.from({ length: len }, () => pool[randomInt(pool.length)]).join("");
  } while (!chosen.every((set) => [...pw].some((c) => set.includes(c))));
  $("pw-out").textContent = pw;
}

const COMMON = new Set([
  "123456", "123456789", "12345678", "password", "wachtwoord", "qwerty", "qwerty123", "12345", "1234567",
  "111111", "123123", "abc123", "1234567890", "admin", "welkom", "welcome", "iloveyou", "letmein", "monkey",
  "dragon", "football", "voetbal", "sunshine", "princess", "000000", "654321", "azerty", "passw0rd", "p@ssw0rd",
  "master", "hello", "shadow", "superman", "trustno1", "geheim", "zomer", "winter", "ajax", "feyenoord",
]);

function formatDuration(sec) {
  if (sec < 1) return "direct";
  const units = [["eeuwen", 3153600000], ["jaar", 31536000], ["dagen", 86400], ["uur", 3600], ["minuten", 60], ["seconden", 1]];
  if (sec > 3153600000 * 1e6) return "langer dan het heelal bestaat";
  for (const [name, size] of units) {
    if (sec >= size) {
      const v = sec / size;
      return `${v >= 1000 ? Math.round(v).toLocaleString("nl-NL") : Math.round(v)} ${name}`;
    }
  }
}

function testPassword() {
  const pw = $("pw-test").value;
  const meter = $("pw-meter");
  if (!pw) {
    meter.style.width = "0";
    $("pw-stats").innerHTML = "";
    $("pw-tips").innerHTML = "";
    return;
  }

  let pool = 0;
  const has = {
    lower: /[a-z]/.test(pw),
    upper: /[A-Z]/.test(pw),
    digits: /\d/.test(pw),
    symbols: /[^a-zA-Z0-9]/.test(pw),
  };
  if (has.lower) pool += 26;
  if (has.upper) pool += 26;
  if (has.digits) pool += 10;
  if (has.symbols) pool += 33;

  const len = [...pw].length;
  let entropy = len * Math.log2(pool);
  const tips = [];

  const base = pw.toLowerCase().replace(/[\d\W_]+$/, "");
  if (COMMON.has(pw.toLowerCase()) || COMMON.has(base)) {
    entropy = Math.min(entropy, 10);
    tips.push(["err", "Dit wachtwoord (of de basis ervan) staat in lijsten met veelgebruikte wachtwoorden."]);
  } else if (/^(.)\1+$/.test(pw)) {
    entropy = Math.min(entropy, Math.log2(pool * len));
    tips.push(["err", "Alleen herhaalde tekens."]);
  } else if (/(0123|1234|2345|3456|4567|5678|6789|abcd|qwer|asdf|zxcv)/i.test(pw)) {
    entropy *= 0.75;
    tips.push(["warn", "Bevat een voorspelbare reeks (zoals 1234 of qwer)."]);
  }

  if (len < 12) tips.push(["warn", "Gebruik minstens 12 tekens; lengte helpt het meest."]);
  const missing = Object.entries({ lower: "kleine letters", upper: "hoofdletters", digits: "cijfers", symbols: "symbolen" }).filter(([k]) => !has[k]).map(([, v]) => v);
  if (missing.length && entropy < 80) tips.push(["warn", `Voeg ${missing.join(", ")} toe.`]);

  const seconds = 2 ** entropy / 2 / 1e10;
  const levels = [[28, "Zeer zwak", "var(--red)"], [36, "Zwak", "var(--red)"], [60, "Redelijk", "var(--amber)"], [80, "Sterk", "var(--green)"], [Infinity, "Zeer sterk", "var(--green)"]];
  const [, label, color] = levels.find(([max]) => entropy < max);

  meter.style.width = Math.max(4, Math.min(100, entropy)) + "%";
  meter.style.setProperty("--c", color);
  kv($("pw-stats"), [
    ["Sterkte", label],
    ["Lengte", `${len} tekens`],
    ["Entropie", `± ${Math.round(entropy)} bits`],
    ["Kraaktijd", formatDuration(seconds)],
  ]);
  $("pw-stats").querySelector("dd span").style.color = color;
  $("pw-tips").innerHTML = tips.map(([t, m]) => `<div class="msg ${t}">${escapeHtml(m)}</div>`).join("");
}

$("pw-len").addEventListener("input", () => {
  $("pw-len-val").textContent = $("pw-len").value;
  generatePassword();
});
["lower", "upper", "digits", "symbols", "ambig"].forEach((k) => $("pw-" + k).addEventListener("change", generatePassword));
$("pw-gen").addEventListener("click", generatePassword);
$("pw-test").addEventListener("input", testPassword);
$("pw-show").addEventListener("change", () => ($("pw-test").type = $("pw-show").checked ? "text" : "password"));
$("pw-test-this").addEventListener("click", () => {
  $("pw-test").value = $("pw-out").textContent;
  testPassword();
});
generatePassword();

// ================= Unix-tijd =================

const dtLong = new Intl.DateTimeFormat("nl-NL", { dateStyle: "full", timeStyle: "long" });

function tickNow() {
  const ms = Date.now();
  $("time-now").textContent = `${Math.floor(ms / 1000)}  ·  ${new Date(ms).toISOString()}`;
}

function tsToDate() {
  const raw = $("time-ts").value.trim();
  const out = $("time-ts-out");
  if (!raw) return (out.innerHTML = "");
  if (!/^-?\d+(\.\d+)?$/.test(raw)) return kv(out, [["Fout", "Alleen cijfers"]]);
  const n = Number(raw);
  const isMs = Math.abs(n) >= 1e11;
  const d = new Date(isMs ? n : n * 1000);
  if (isNaN(d)) return kv(out, [["Fout", "Buiten bereik"]]);
  kv(out, [
    ["Eenheid", isMs ? "milliseconden" : "seconden"],
    ["UTC", d.toISOString(), true],
    ["Lokaal", dtLong.format(d)],
    ["Relatief", relative(d)],
  ]);
}

function dateToTs() {
  const v = $("time-date").value;
  const out = $("time-date-out");
  if (!v) return (out.innerHTML = "");
  const d = new Date(v);
  kv(out, [
    ["Seconden", String(Math.floor(d.getTime() / 1000)), true],
    ["Milliseconden", String(d.getTime()), true],
    ["UTC", d.toISOString(), true],
  ]);
}

$("time-ts").addEventListener("input", tsToDate);
$("time-date").addEventListener("input", dateToTs);
tickNow();
setInterval(tickNow, 1000);
$("time-ts").value = Math.floor(Date.now() / 1000);
tsToDate();

route();
