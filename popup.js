// 팝업: 검색어를 받아 현재 탭의 content script 에 넘긴다.
// ?tabId=N 은 E2E 시험용 — 팝업을 탭으로 열었을 때 대상 탭을 지정한다.
// 즐겨찾기는 storage.sync(같은 Chrome 계정의 다른 PC 로 따라감), 최근 사용은 storage.local(이 PC 만).
"use strict";

const H = globalThis.RPSHistory;
const t = globalThis.RPSt;
const $ = (id) => document.getElementById(id);

// popup.html 의 data-i18n(글자)·data-i18n-<속성>(그 속성)을 번역문으로 바꾼다. 번역이 없으면 적힌 한국어가 남는다
for (const el of document.querySelectorAll("*")) {
  for (const a of [...el.attributes]) {
    if (!a.name.startsWith("data-i18n")) continue;
    const target = a.name === "data-i18n" ? null : a.name.slice("data-i18n-".length);
    const ko = target ? el.getAttribute(target) : el.textContent;
    const s = t(a.value, ko);
    if (target) el.setAttribute(target, s); else el.textContent = s;
  }
}
document.documentElement.lang = t("htmlLang", "ko");
const q = $("q"), ci = $("ci"), dotall = $("dotall"), st = $("st"), msg = $("msg"), favBtn = $("fav"), follow = $("follow");
const ALL_SITES = { origins: ["<all_urls>"] };
let tabId = null;
let lastKey = null; // 마지막으로 검색한 (패턴, 옵션) — 같으면 Enter 는 「다음」
let favorites = [];
let recent = [];

function opts() { return { ignoreCase: ci.checked, dotAll: dotall.checked }; }
function keyOf(pattern, o) { return JSON.stringify([pattern, { ignoreCase: !!(o && o.ignoreCase), dotAll: !!(o && o.dotAll) }]); }
function key() { return keyOf(q.value, opts()); }

// 「이동해도 계속 검색」 상태: storage.session 의 follow:<tabId> 가 있으면 켜짐(background.js 가 읽는다)
const followKey = () => `follow:${tabId}`;
async function setFollow(on) {
  if (on && q.value) await chrome.storage.session.set({ [followKey()]: { pattern: q.value, opts: opts() } });
  else await chrome.storage.session.remove(followKey());
}
function current() { return H.entry(q.value, opts()); }

function show(r) {
  msg.className = "";
  q.classList.remove("bad");
  if (!r) { st.textContent = ""; msg.textContent = ""; return; }
  if (r.error) {
    st.textContent = "";
    msg.textContent = r.error;
    msg.className = "err";
    q.classList.add("bad");
    return;
  }
  st.textContent = r.count ? `${r.index + 1} / ${r.count}` : (r.pattern ? t("zeroCount", "0건") : "");
  const notes = [];
  if (r.truncated) notes.push(t("truncated", "일치가 너무 많아 처음 $1건만 표시합니다", r.count));
  if (r.empty) notes.push(t("emptyMatches", "길이 0 일치 $1건은 칠할 수 없어 뺐습니다", r.empty));
  if (r.note) notes.push(r.note);
  msg.textContent = notes.join("\n");
}

// ── 저장 목록 ──
async function loadLists() {
  try { favorites = (await chrome.storage.sync.get("favorites")).favorites || []; } catch (_) { favorites = []; }
  try { recent = (await chrome.storage.local.get("recent")).recent || []; } catch (_) { recent = []; }
}

// 저장에 성공한 뒤에만 화면 목록을 바꾼다 — 실패했는데 더해진 것처럼 보이면 팝업을 다시 열 때 사라진다
async function saveFavorites(next) {
  try {
    await chrome.storage.sync.set({ favorites: next });
    favorites = next;
  } catch (e) {
    show({ error: t("favSaveFailed", "즐겨찾기를 저장하지 못했습니다: $1", e.message || e) });
  }
}

function renderList(ul, list, actions) {
  ul.replaceChildren();
  for (const e of list) {
    const li = document.createElement("li");
    const pick = document.createElement("button");
    pick.type = "button";
    pick.className = "pick";
    pick.textContent = e.pattern;
    pick.title = e.pattern;
    pick.addEventListener("click", () => use(e));
    li.append(pick);
    const b = H.badge(e);
    if (b) {
      const s = document.createElement("span");
      s.className = "badge";
      s.textContent = b;
      s.title = [e.ignoreCase && t("ignoreCase", "대소문자 무시"), e.dotAll && t("dotAll", ". 이 줄바꿈 포함")].filter(Boolean).join(" ");
      li.append(s);
    }
    for (const [label, title, fn] of actions(e)) {
      const a = document.createElement("button");
      a.type = "button";
      a.className = "act";
      a.textContent = label;
      a.title = title;
      a.addEventListener("click", fn);
      li.append(a);
    }
    ul.append(li);
  }
}

function render() {
  renderList($("favs"), favorites, (e) => [["✕", t("favRemove", "즐겨찾기에서 빼기"), async () => {
    await saveFavorites(H.remove(favorites, e));
    render();
  }]]);
  renderList($("recent"), recent, (e) => H.isFavorite(favorites, e) ? [] : [["☆", t("favAdd", "즐겨찾기에 저장"), async () => {
    const r = H.toggleFavorite(favorites, e);
    if (r.full) { show({ error: t("favFull", "즐겨찾기가 가득 찼습니다(최대 $1개, Chrome 동기화 저장 한도 8KB 안에서). 안 쓰는 것을 빼 주세요", H.FAVORITE_MAX) }); return; }
    await saveFavorites(r.list);
    render();
  }]]);
  const on = !!q.value && H.isFavorite(favorites, current());
  favBtn.textContent = on ? "★" : "☆";
  favBtn.setAttribute("aria-pressed", String(on));
}

function use(e) {
  q.value = e.pattern;
  ci.checked = e.ignoreCase;
  dotall.checked = e.dotAll;
  lastKey = null;
  render();
  run(1);
  q.focus();
}

// ── 검색 ──
async function targetTab() {
  const p = new URLSearchParams(location.search).get("tabId");
  if (p) return Number(p);
  const [t] = await chrome.tabs.query({ active: true, currentWindow: true });
  return t ? t.id : null;
}

async function inject() {
  await chrome.scripting.executeScript({ target: { tabId }, files: ["src/i18n.js", "src/core.js", "src/content.js"] });
}

async function send(m) {
  try {
    return await chrome.tabs.sendMessage(tabId, m);
  } catch (_) {
    await inject();
    return await chrome.tabs.sendMessage(tabId, m);
  }
}

async function run(delta) {
  try {
    if (!q.value) { show(await send({ type: "clear" })); lastKey = null; return; }
    let r;
    if (lastKey === key()) r = await send({ type: "step", delta });
    else {
      r = await send({ type: "search", pattern: q.value, opts: opts() });
      if (!r.error) {
        lastKey = key();
        recent = H.addRecent(recent, current());
        chrome.storage.local.set({ recent });
        if (follow.checked) await setFollow(true); // 따라가는 검색어도 지금 것으로
        render();
      }
      if (!r.error && delta < 0 && r.count) r = await send({ type: "step", delta: -1 });
    }
    show(r);
    chrome.storage.local.set({ pattern: q.value, opts: opts() });
  } catch (e) {
    show({ error: t("cannotSearch", "이 페이지에서는 검색할 수 없습니다 ($1)", e.message || e) });
  }
}

$("f").addEventListener("submit", (e) => e.preventDefault());
q.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); run(e.shiftKey ? -1 : 1); }
});
q.addEventListener("input", render);
$("next").addEventListener("click", () => run(1));
$("prev").addEventListener("click", () => run(-1));
$("clear").addEventListener("click", async () => {
  lastKey = null;
  follow.checked = false;
  await setFollow(false);
  try { show(await send({ type: "clear" })); } catch (_) { show(null); }
});
follow.addEventListener("change", async () => {
  if (follow.checked) {
    // 권한 요청은 클릭 처리 안에서 바로 해야 Chrome 이 받아 준다
    // 「허용 안 함」(false)과 요청 자체의 실패(예외)를 나눠 알린다. 예외의 흔한 원인은 manifest 를 바꾼 뒤 확장을
    // 다시 로드하지 않은 것이다 — 팝업 파일은 디스크에서 바로 읽혀 새 체크박스가 보이지만 옛 manifest 에는 선택
    // 권한 선언이 없다(2026-10-16 실제로 겪음).
    let granted = false, why = "";
    try { granted = await chrome.permissions.request(ALL_SITES); } catch (e) { why = (e && e.message) || String(e); }
    if (!granted) {
      follow.checked = false;
      show({
        error: why
          ? t("permFailed", "권한 요청이 실패했습니다: $1\nchrome://extensions 에서 이 확장을 새로고침(↻)한 뒤 다시 해 보세요.", why)
          : t("permDenied", "권한을 허용하지 않아 「이동해도 계속 검색」을 켜지 못했습니다"),
      });
      return;
    }
  }
  await setFollow(follow.checked);
  if (follow.checked && q.value && lastKey !== key()) run(1);
});
favBtn.addEventListener("click", async () => {
  if (!q.value) return;
  const r = H.toggleFavorite(favorites, current());
  if (r.full) { show({ error: t("favFull", "즐겨찾기가 가득 찼습니다(최대 $1개, Chrome 동기화 저장 한도 8KB 안에서). 안 쓰는 것을 빼 주세요", H.FAVORITE_MAX) }); return; }
  await saveFavorites(r.list);
  render();
  q.focus();
});
for (const box of [ci, dotall]) box.addEventListener("change", () => { render(); if (q.value) run(1); });

(async function init() {
  tabId = await targetTab();
  await loadLists();
  const saved = await chrome.storage.local.get(["pattern", "opts"]);
  if (saved.pattern) q.value = saved.pattern;
  if (saved.opts) { ci.checked = !!saved.opts.ignoreCase; dotall.checked = !!saved.opts.dotAll; }
  try { follow.checked = !!(await chrome.storage.session.get(followKey()))[followKey()]; } catch (_) { follow.checked = false; }
  render();
  q.focus();
  q.select();
  // 이미 이 탭에서 검색해 둔 결과가 있으면 그 상태를 보인다(주입 전이면 조용히 넘어간다).
  // lastKey 는 페이지가 보고한 실제 검색어·옵션으로만 정한다 — 입력창 값으로 짐작하면, 페이지의 결과가 다른 옵션이거나
  // 낡았을 때 Enter 가 새 검색 대신 낡은 결과 사이 이동이 된다(옵션을 껐다 켜야 검색되던 버그, 2026-10-16).
  try {
    const r = await chrome.tabs.sendMessage(tabId, { type: "status" });
    if (r && r.pattern) {
      show(r);
      lastKey = keyOf(r.pattern, r.opts);
    }
  } catch (_) { /* 아직 주입 안 됨 */ }
})();
