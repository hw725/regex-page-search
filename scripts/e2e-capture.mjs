// E2E: 실제 Chromium 에 확장을 로드해 시험 페이지를 팝업으로 검색하고, 기대 개수를 대조한 뒤 화면을 캡처한다.
// 하네스 계약 C-002 의 검사 명령. 캡처는 $HARNESS_SCRATCH(없으면 .harness/e2e-manual)에 쓴다.
//
// 시험용으로만 바꾸는 것(제품 manifest 는 그대로):
//   - 확장 사본에 host_permissions(127.0.0.1)를 더한다. activeTab 은 사람이 아이콘을 눌러야 생기는 권한이고,
//     「이동해도 계속 검색」의 선택 권한 요청 창도 자동화로 누를 수 없다. 그래서 그 체크박스의 권한 요청 단계는
//     시험하지 못하고, 켜진 상태(storage.session)를 직접 만들어 service worker 쪽 동작만 시험한다.
//   - 팝업을 탭으로 열고 ?tabId= 로 대상 탭을 지정한다.
// 정식 Chrome 137+ 는 --load-extension 을 막으므로 Playwright 의 Chromium 을 쓴다. 이 PC 캐시에 있는 가장 새 판을
// 고르고(CHROMIUM_PATH 로 덮어쓸 수 있음), 없으면 playwright 기본값에 맡긴다.
import { chromium } from "playwright";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runtimeFiles } from "./build-zip.mjs";

// 화면 언어(기본 ko). RPS_LANG=en 이면 영어 화면으로 같은 시험을 돌린다 — 기대값은 개수·「1 / 2」 같은 숫자뿐이다
const LANG = process.env.RPS_LANG || "ko";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = process.env.HARNESS_SCRATCH || path.join(ROOT, ".harness", "e2e-manual");
fs.mkdirSync(OUT, { recursive: true });

function findChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const base = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), ".cache"), "ms-playwright");
  if (!fs.existsSync(base)) return undefined;
  const dirs = fs.readdirSync(base).filter((d) => /^chromium-\d+$/.test(d))
    .sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1]));
  for (const d of dirs) {
    for (const exe of ["chrome-win64/chrome.exe", "chrome-win/chrome.exe", "chrome-linux/chrome", "chrome-linux64/chrome"]) {
      const p = path.join(base, d, exe);
      if (fs.existsSync(p)) return p;
    }
  }
  return undefined;
}

function copyExtension(dst) {
  // 배포 zip 과 같은 목록으로 — 시험 사본에만 있는 파일이 있으면 「시험은 통과, 스토어 판은 깨짐」이 된다
  for (const f of runtimeFiles()) {
    fs.mkdirSync(path.dirname(path.join(dst, f)), { recursive: true });
    fs.copyFileSync(path.join(ROOT, f), path.join(dst, f));
  }
  const m = JSON.parse(fs.readFileSync(path.join(dst, "manifest.json"), "utf8"));
  m.host_permissions = ["http://127.0.0.1/*"];
  fs.writeFileSync(path.join(dst, "manifest.json"), JSON.stringify(m, null, 2));
}

function serve() {
  const html = fs.readFileSync(path.join(ROOT, "test", "fixtures", "page.html"));
  const srv = http.createServer((_q, res) => { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); res.end(html); });
  return new Promise((ok) => srv.listen(0, "127.0.0.1", () => ok(srv)));
}

const CASES = [
  // [이름, 패턴, 기대 개수]
  ["줄 단위 ^$ (블록 경계)", "^第.章$", 2],
  ["숨김·script 제외", "第隱章|第腳本", 0],
  ["여러 노드에 걸친 일치", "學而時習", 1],
  ["소스 줄바꿈·공백 접기", "有朋 自遠方來", 1],
  ["pre 공백 보존", "^ {4}indented$", 1],
  ["확장 B 한자 한 글자", "^\\p{Script=Han}{3}$", 3],
  ["호환 한자 U+F914 구별", "\uF914", 1],
  ["통합 한자 U+6A02 구별", "\u6A02", 1],
  ["표 칸 탭", "名\\t字", 1],
  ["Onigmo 식 속성 이름(사용자 지적 C-003)", "\\p{hangul}+\\(\\p{han}+\\)", 1],
];

const results = [];
let failed = 0;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rps-e2e-"));
const extDir = path.join(tmp, "ext");
fs.mkdirSync(extDir);
copyExtension(extDir);
const srv = await serve();
const url = `http://127.0.0.1:${srv.address().port}/`;
const exe = findChromium();
console.log(`chromium: ${exe || "(playwright 기본값)"}`);

const ctx = await chromium.launchPersistentContext(path.join(tmp, "profile"), {
  executablePath: exe,
  headless: true,
  viewport: { width: 900, height: 1000 },
  locale: LANG,
  args: [`--disable-extensions-except=${extDir}`, `--load-extension=${extDir}`, `--lang=${LANG}`],
});
try {
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent("serviceworker", { timeout: 15000 });
  const extId = new URL(sw.url()).host;

  const page = await ctx.newPage();
  await page.goto(url);
  const popup = await ctx.newPage();
  await popup.goto(`chrome-extension://${extId}/popup.html`);
  const tabId = await popup.evaluate(async (u) => (await chrome.tabs.query({})).find((t) => t.url === u).id, url);
  await popup.goto(`chrome-extension://${extId}/popup.html?tabId=${tabId}`);
  await popup.setViewportSize({ width: 360, height: 190 });

  const st = popup.locator("#st");
  // 상태 칸과 안내문은 한 번에 읽는다 — 따로 읽으면 그 사이 화면 갱신이 끼어 한쪽만 새 값이 된다
  const readStatus = () => popup.evaluate(() => ({
    st: document.getElementById("st").textContent || "", msg: document.getElementById("msg").textContent || "",
  }));
  async function waitStatus(prev) {
    for (let i = 0; i < 100; i++) {
      const s = await readStatus();
      if (s.st !== prev || s.msg) return s;
      await new Promise((r) => setTimeout(r, 50));
    }
    return { st: (await readStatus()).st, msg: "(시간 초과)" };
  }
  async function searchFor(pattern) {
    await popup.locator("#clear").click();
    await new Promise((r) => setTimeout(r, 100));
    await popup.locator("#q").fill(pattern);
    await popup.locator("#q").press("Enter");
    return waitStatus("");
  }
  function countOf(s) {
    if (s === "0건" || s === "0 matches") return 0;
    const m = /^(\d+) \/ (\d+)$/.exec(s);
    return m ? Number(m[2]) : NaN;
  }
  // 페이지(주 세계)에서도 강조가 보이는지 — Highlight 레지스트리는 문서 단위라 content script 가 등록한 것이 보여야 한다
  const hlSize = () => page.evaluate(() => (CSS.highlights.get("rps-all") || { size: 0 }).size);

  for (const [name, pattern, want] of CASES) {
    const r = await searchFor(pattern);
    const got = countOf(r.st);
    const hl = await hlSize();
    const ok = got === want && hl === want;
    if (!ok) failed++;
    results.push({ name, pattern, want, got, highlights: hl, status: r.st, msg: r.msg, ok });
    console.log(`${ok ? "PASS" : "FAIL"} ${name}: 기대 ${want} · 팝업 ${r.st || "-"} · 강조 ${hl}${r.msg ? " · " + r.msg : ""}`);
  }

  // 이전/다음: 第 은 第一章·第二章·第三章 의 3건
  const nav = [];
  let r = await searchFor("第");
  nav.push(r.st);
  await popup.locator("#q").press("Enter"); r = await waitStatus(r.st); nav.push(r.st);
  await popup.locator("#q").press("Shift+Enter"); r = await waitStatus(r.st); nav.push(r.st);
  await popup.locator("#q").press("Shift+Enter"); r = await waitStatus(r.st); nav.push(r.st);
  const navWant = ["1 / 3", "2 / 3", "1 / 3", "3 / 3"];
  const navOk = JSON.stringify(nav) === JSON.stringify(navWant);
  if (!navOk) failed++;
  results.push({ name: "이전/다음 순환", want: navWant, got: nav, ok: navOk });
  console.log(`${navOk ? "PASS" : "FAIL"} 이전/다음 순환: ${nav.join(" → ")}`);

  const check = (name, ok, detail) => {
    if (!ok) failed++;
    results.push({ name, ok, detail });
    console.log(`${ok ? "PASS" : "FAIL"} ${name}: ${detail}`);
  };
  const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
  async function reopenPopup() {
    await popup.goto(`chrome-extension://${extId}/popup.html?tabId=${tabId}`);
    await sleep(400);
  }
  async function waitHl(want, ms) {
    let n = -1;
    for (let t = 0; t < ms; t += 100) { n = await hlSize(); if (n === want) break; await sleep(100); }
    return n;
  }

  // ── 최근 사용·즐겨찾기 (C-004) ──
  await searchFor("^第.章$");
  await popup.locator("#fav").click();
  await reopenPopup();
  const recentFirst = await popup.locator("#recent .pick").first().textContent();
  const favs = await popup.locator("#favs .pick").allTextContents();
  check("최근 사용 기록", recentFirst === "^第.章$", `최근 첫 항목 ${recentFirst}`);
  check("즐겨찾기 저장(팝업 다시 열어도 남음)", favs.includes("^第.章$"), `즐겨찾기 ${JSON.stringify(favs)}`);
  await popup.locator("#clear").click();
  await popup.locator("#q").fill("");
  await sleep(100);
  await popup.locator("#favs .pick", { hasText: "^第.章$" }).click();
  r = await waitStatus("");
  const qv = await popup.locator("#q").inputValue();
  check("즐겨찾기 눌러 불러오기·검색", r.st === "1 / 2" && qv === "^第.章$", `입력창 ${qv} · 상태 ${r.st}`);

  // ── 같은 페이지 안의 내용 변화 → 자동 재검색 ──
  await searchFor("第");
  await page.evaluate(() => { const p = document.createElement("p"); p.textContent = "第四章"; document.body.append(p); });
  let hl = await waitHl(4, 3000);
  check("내용 추가 뒤 자동 재검색", hl === 4, `강조 ${hl}(기대 4)`);

  // ── 사용자 지적 버그: 내용이 바뀐 페이지에서 팝업을 다시 열고 Enter 하면 새로 검색돼야 한다 ──
  await page.evaluate(() => { document.body.innerHTML = "<p>第甲</p><p>第乙</p>"; });
  await reopenPopup();
  await popup.locator("#q").press("Enter");
  await sleep(500);
  hl = await hlSize();
  const st2 = (await st.textContent()) ?? "";
  check("내용이 바뀐 뒤 팝업 다시 열고 Enter", hl === 2 && /\/ 2$/.test(st2), `강조 ${hl} · 상태 ${st2}(기대 ?/2)`);

  // ── 다시 주입(확장 재로드 뒤와 같은 상황) → 옛 설치를 걷어 내고 한 번만 응답 ──
  const sw2 = ctx.serviceWorkers()[0] || sw;
  await sw2.evaluate((id) => chrome.scripting.executeScript({ target: { tabId: id }, files: ["src/core.js", "src/content.js"] }), tabId);
  r = await searchFor("第");
  hl = await hlSize();
  check("다시 주입한 뒤 검색", r.st === "1 / 2" && hl === 2, `상태 ${r.st} · 강조 ${hl}`);

  // ── 「이동해도 계속 검색」(service worker) — 켜진 상태를 직접 만든다(권한 요청 창은 자동화 불가) ──
  await popup.evaluate((id) => chrome.storage.session.set({ [`follow:${id}`]: { pattern: "第", opts: {} } }), tabId);
  await page.goto(url + "next");
  hl = await waitHl(3, 5000);
  check("이동 뒤 자동 재검색(켬)", hl === 3, `강조 ${hl}(기대 3)`);
  await popup.evaluate((id) => chrome.storage.session.remove(`follow:${id}`), tabId);
  await page.goto(url + "again");
  await sleep(1500);
  hl = await hlSize();
  check("이동 뒤 자동 재검색(끔)", hl === 0, `강조 ${hl}(기대 0)`);

  // 캡처: 여러 경우를 한 번에 칠한 페이지 + 팝업(즐겨찾기·최근 목록 포함)
  await reopenPopup();
  await popup.setViewportSize({ width: 360, height: 520 });
  await searchFor("第.章|學而時習|有朋 自遠方來|indented|^\\p{Script=Han}{3}$|\uF914|名\\t字|\\p{hangul}+\\(\\p{han}+\\)");
  await popup.screenshot({ path: path.join(OUT, "popup.png") });
  await page.bringToFront();
  await page.screenshot({ path: path.join(OUT, "page-highlights.png"), fullPage: true });
} catch (e) {
  failed++;
  console.log(`FAIL 실행 오류: ${e && e.stack || e}`);
} finally {
  await ctx.close();
  srv.close();
  fs.writeFileSync(path.join(OUT, "e2e-results.json"), JSON.stringify(results, null, 2));
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) { /* 임시 폴더 정리 실패는 무시 */ }
}
console.log(`e2e: ${results.filter((x) => x.ok).length} 통과 / ${results.length} · 실패 ${failed}`);
process.exit(failed ? 1 : 0);
