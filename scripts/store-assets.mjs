// 웹 스토어 등록용 그림을 만든다: node scripts/store-assets.mjs → store/assets/
//   screenshot-<언어>-<n>.png (1280×800): store/demo-*.html 을 실제 확장으로 검색한 화면 + 그때의 팝업을 오른쪽 위에 겹친 것
//   promo-440x280.png: 작은 홍보 타일(필수, 언어 구분 없음)
// 화면은 꾸미지 않고 확장이 실제로 칠한 결과를 쓴다(스토어 정책: 기능을 사실대로 보여 줄 것). 띄우는 방법은 e2e-capture.mjs 와 같다.
import { chromium } from "playwright";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runtimeFiles } from "./build-zip.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "store", "assets");
fs.mkdirSync(OUT, { recursive: true });

const SHOTS = [
  // [데모 페이지, 패턴, 즐겨찾기에 미리 넣을 패턴들, 설명(ko), 설명(en)]
  ["demo-classics.html", "\\p{hangul}+\\(\\p{han}+\\)", ["^第.章$", "\\p{Script=Han}{2,}"],
    "\\p{hangul}+\\(\\p{han}+\\) — EmEditor·Onigmo 식 속성 이름 그대로", "\\p{hangul}+\\(\\p{han}+\\) — Onigmo-style property names work as-is"],
  ["demo-log.html", "^\\S+ (ERROR|WARN) .*$", ["\\bTODO\\b", "^\\s*$"],
    "^ $ 는 화면에 보이는 줄 단위", "^ and $ anchor to each visible line"],
];

function chromiumPath() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const base = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), ".cache"), "ms-playwright");
  if (!fs.existsSync(base)) return undefined;
  const dirs = fs.readdirSync(base).filter((d) => /^chromium-\d+$/.test(d)).sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1]));
  for (const d of dirs) for (const exe of ["chrome-win64/chrome.exe", "chrome-win/chrome.exe", "chrome-linux/chrome"]) {
    const p = path.join(base, d, exe);
    if (fs.existsSync(p)) return p;
  }
  return undefined;
}

function serve() {
  const srv = http.createServer((q, res) => {
    const f = path.join(ROOT, "store", path.basename(new URL(q.url, "http://x").pathname));
    if (!fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(fs.readFileSync(f));
  });
  return new Promise((ok) => srv.listen(0, "127.0.0.1", () => ok(srv)));
}

const png = (buf) => "data:image/png;base64," + buf.toString("base64");
const icon = png(fs.readFileSync(path.join(ROOT, "icons", "icon128.png")));

async function compose(ctx, pageShot, popupShot, caption) {
  const p = await ctx.newPage();
  await p.setViewportSize({ width: 1280, height: 800 });
  await p.setContent(`<body style="margin:0;width:1280px;height:800px;overflow:hidden;position:relative;font-family:'Pretendard GOV Variable',Pretendard,system-ui,sans-serif">
    <img src="${png(pageShot)}" style="position:absolute;inset:0">
    <img src="${png(popupShot)}" style="position:absolute;top:16px;right:24px;border-radius:8px;box-shadow:0 8px 28px rgba(0,0,0,.35);border:1px solid rgba(0,0,0,.15)">
    <div style="position:absolute;left:24px;bottom:24px;padding:10px 16px;border-radius:8px;background:rgba(31,42,68,.92);color:#fff;font-size:20px">${caption.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</div>
  </body>`);
  const buf = await p.screenshot();
  await p.close();
  return buf;
}

async function promo(ctx, lang) {
  const p = await ctx.newPage();
  await p.setViewportSize({ width: 440, height: 280 });
  const [name, line1, line2] = lang === "ko"
    ? ["정규식 페이지 검색", "^ $ 줄 단위 · 유니코드 상시", "\\p{hangul} \\p{han} 그대로"]
    : ["Regex Page Search", "Line-based ^ $ · Unicode always on", "Onigmo-style \\p{han} names"];
  await p.setContent(`<body style="margin:0;width:440px;height:280px;background:#1f2a44;color:#fff;display:flex;align-items:center;gap:22px;padding:0 30px;box-sizing:border-box;font-family:'Pretendard GOV Variable',Pretendard,system-ui,sans-serif">
    <img src="${icon}" width="112" height="112" style="flex:none">
    <div><div style="font-size:30px;font-weight:700;line-height:1.2">${name}</div>
    <div style="margin-top:12px;font-size:16px;color:#ffb366">${line1}</div>
    <div style="margin-top:4px;font:15px 'Sarasa Fixed K',Consolas,monospace;color:#d6dbe6">${line2}</div></div></body>`);
  fs.writeFileSync(path.join(OUT, "promo-440x280.png"), await p.screenshot());
  await p.close();
}

// 마키 타일(1400×560, 알파 없는 PNG): 왼쪽에 이름, 오른쪽에 앞서 만든 실제 화면(screenshot-ko-1)의 페이지 쪽만(팝업이 반쯤 잘려 보이지 않게)
async function marquee(ctx) {
  const p = await ctx.newPage();
  await p.setViewportSize({ width: 1400, height: 560 });
  const shot = png(fs.readFileSync(path.join(OUT, "screenshot-ko-1.png")));
  await p.setContent(`<body style="margin:0;width:1400px;height:560px;overflow:hidden;background:#1f2a44;color:#fff;position:relative;font-family:'Pretendard GOV Variable',Pretendard,system-ui,sans-serif">
    <div style="position:absolute;left:80px;top:150px;display:flex;align-items:center;gap:28px">
      <img src="${icon}" width="128" height="128">
      <div><div style="font-size:52px;font-weight:700;line-height:1.15">Regex Page Search</div>
      <div style="margin-top:14px;font-size:24px;color:#ffb366">Line-based ^ $ · Unicode always on</div>
      <div style="margin-top:8px;font:22px 'Sarasa Fixed K',Consolas,monospace;color:#d6dbe6">\\p{hangul}+\\(\\p{han}+\\)</div></div>
    </div>
    <div style="position:absolute;left:800px;top:70px;width:560px;height:560px;border-radius:12px;overflow:hidden;box-shadow:0 12px 40px rgba(0,0,0,.45)">
      <img src="${shot}" style="width:900px;display:block">
    </div></body>`);
  fs.writeFileSync(path.join(OUT, "marquee-1400x560.png"), await p.screenshot());
  await p.close();
}

const srv = await serve();
const base = `http://127.0.0.1:${srv.address().port}/`;
for (const lang of ["ko", "en"]) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rps-store-"));
  const ext = path.join(tmp, "ext");
  for (const f of runtimeFiles()) {
    fs.mkdirSync(path.dirname(path.join(ext, f)), { recursive: true });
    fs.copyFileSync(path.join(ROOT, f), path.join(ext, f));
  }
  const m = JSON.parse(fs.readFileSync(path.join(ext, "manifest.json"), "utf8"));
  m.host_permissions = ["http://127.0.0.1/*"]; // 시험 사본에만 — activeTab 은 자동화로 줄 수 없다
  fs.writeFileSync(path.join(ext, "manifest.json"), JSON.stringify(m));
  const ctx = await chromium.launchPersistentContext(path.join(tmp, "profile"), {
    executablePath: chromiumPath(), headless: true, locale: lang, viewport: { width: 1280, height: 800 },
    args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`, `--lang=${lang}`],
  });
  try {
    let [sw] = ctx.serviceWorkers();
    if (!sw) sw = await ctx.waitForEvent("serviceworker", { timeout: 15000 });
    const extId = new URL(sw.url()).host;
    let n = 0;
    for (const [file, pattern, favs, ko, en] of SHOTS) {
      const page = await ctx.newPage();
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto(base + file);
      const popup = await ctx.newPage();
      await popup.goto(`chrome-extension://${extId}/popup.html`);
      const tabId = await popup.evaluate(async (u) => (await chrome.tabs.query({})).find((t) => t.url === u).id, base + file);
      await popup.evaluate(async (f) => {
        await chrome.storage.sync.set({ favorites: f.map((p) => ({ pattern: p, ignoreCase: false, dotAll: false })) });
        await chrome.storage.local.set({ recent: [] });
      }, favs);
      await popup.goto(`chrome-extension://${extId}/popup.html?tabId=${tabId}`);
      await popup.setViewportSize({ width: 360, height: 600 });
      await popup.fill("#q", pattern);
      await popup.press("#q", "Enter");
      await popup.waitForFunction(() => /\d/.test(document.getElementById("st").textContent));
      await popup.waitForTimeout(300);
      const h = await popup.evaluate(() => Math.ceil(document.body.getBoundingClientRect().height));
      const popupShot = await popup.screenshot({ clip: { x: 0, y: 0, width: 360, height: h } });
      await page.bringToFront();
      const pageShot = await page.screenshot();
      fs.writeFileSync(path.join(OUT, `screenshot-${lang}-${++n}.png`), await compose(ctx, pageShot, popupShot, lang === "ko" ? ko : en));
      await popup.close();
      await page.close();
    }
    // 홍보 타일은 언어별로 올릴 수 없다(스토어 문서 「Supplying Images」) — 영어 하나만
    if (lang === "en") { await promo(ctx, lang); await marquee(ctx); }
  } finally {
    await ctx.close();
  }
}
srv.close();
console.log("store/assets:", fs.readdirSync(OUT).sort().join(", "));
