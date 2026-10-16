// 「이동해도 계속 검색」: 팝업에서 켠 탭이 새 페이지를 다 읽으면 같은 검색어로 다시 검색한다.
// 켠 탭과 검색어는 storage.session 의 follow:<tabId> 에 있다(브라우저를 닫으면 사라진다).
// 새 페이지에 주입하려면 선택 권한(optional_host_permissions)이 필요하다 — 팝업에서 켤 때 사용자에게 묻는다.
"use strict";

const followKey = (tabId) => `follow:${tabId}`;

chrome.tabs.onUpdated.addListener(async (tabId, info) => {
  if (info.status !== "complete") return;
  const k = followKey(tabId);
  const f = (await chrome.storage.session.get(k))[k];
  if (!f || !f.pattern) return;
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["src/core.js", "src/content.js"] });
    // 자동 재검색은 스크롤하지 않는다 — 새 페이지를 읽기 시작한 위치가 튀지 않게
    await chrome.tabs.sendMessage(tabId, { type: "search", pattern: f.pattern, opts: f.opts, scroll: false });
  } catch (_) {
    // 주입할 수 없는 페이지(chrome://·웹 스토어·권한 없는 사이트)는 건너뛴다
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.session.remove(followKey(tabId));
});
