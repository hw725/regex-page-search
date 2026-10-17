// 최근 사용·즐겨찾기 목록 다루기 — 저장소(chrome.storage)와 분리한 순수 함수. popup 과 Node 테스트가 함께 쓴다.
// 항목: { pattern, ignoreCase, dotAll } — 셋이 모두 같아야 같은 항목이다(같은 패턴이라도 옵션이 다르면 결과가 다르다).
(function (root) {
  "use strict";

  const RECENT_MAX = 20;
  const FAVORITE_MAX = 200;
  // 즐겨찾기는 storage.sync 의 「favorites」 키 하나에 통째로 둔다. 키 하나의 한도(QUOTA_BYTES_PER_ITEM)는 키 이름 + 값 JSON 이
  // 8,192바이트라, 개수만 세면 짧은 패턴 200개로도 넘는다(2026-10-17 발행 전 리뷰). 한자가 많으면 더 빨리 차므로 UTF-8 바이트로
  // 넉넉히 센다(Chrome 이 문자 수로 세더라도 이 값이 더 크거나 같다)
  const SYNC_ITEM_BYTES = 8192;
  const utf8Bytes = (s) => (typeof TextEncoder !== "undefined" ? new TextEncoder().encode(s).length : unescape(encodeURIComponent(s)).length);
  const fitsSync = (list) => utf8Bytes("favorites" + JSON.stringify(list)) <= SYNC_ITEM_BYTES;

  function entry(pattern, opts) {
    opts = opts || {};
    return { pattern: String(pattern), ignoreCase: !!opts.ignoreCase, dotAll: !!opts.dotAll };
  }

  function same(a, b) {
    return a.pattern === b.pattern && !!a.ignoreCase === !!b.ignoreCase && !!a.dotAll === !!b.dotAll;
  }

  function clean(list) {
    return Array.isArray(list) ? list.filter((x) => x && typeof x.pattern === "string" && x.pattern) : [];
  }

  /** 최근 목록 맨 앞에 넣는다(이미 있으면 앞으로 옮긴다). 빈 패턴은 넣지 않는다. */
  function addRecent(list, e, max) {
    const cur = clean(list);
    if (!e || !e.pattern) return cur;
    return [e, ...cur.filter((x) => !same(x, e))].slice(0, max || RECENT_MAX);
  }

  function isFavorite(list, e) {
    return clean(list).some((x) => same(x, e));
  }

  /** 즐겨찾기에 있으면 빼고, 없으면 맨 뒤에 더한다. 개수 한도나 동기화 저장 한도를 넘으면 더하지 않고 그대로 돌려준다. */
  function toggleFavorite(list, e, max) {
    const cur = clean(list);
    if (!e || !e.pattern) return { list: cur, added: false, full: false };
    if (cur.some((x) => same(x, e))) return { list: cur.filter((x) => !same(x, e)), added: false, full: false };
    const next = [...cur, e];
    if (cur.length >= (max || FAVORITE_MAX) || !fitsSync(next)) return { list: cur, added: false, full: true };
    return { list: next, added: true, full: false };
  }

  function remove(list, e) {
    return clean(list).filter((x) => !same(x, e));
  }

  /** 목록에 보일 옵션 표지: i(대소문자 무시)·s(. 이 줄바꿈 포함) */
  function badge(e) {
    return (e.ignoreCase ? "i" : "") + (e.dotAll ? "s" : "");
  }

  root.RPSHistory = { RECENT_MAX, FAVORITE_MAX, SYNC_ITEM_BYTES, fitsSync, entry, same, addRecent, isFavorite, toggleFavorite, remove, badge };
})(typeof globalThis !== "undefined" ? globalThis : this);
