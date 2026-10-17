// 페이지 안에서 도는 쪽. popup·service worker 가 chrome.scripting 으로 core.js 다음에 주입한다.
// 다시 주입되면 앞선 설치를 걷어 내고 새로 설치한다 — 주입은 「응답하는 쪽이 없을 때」만 일어나므로, 앞선 설치는
// 확장을 다시 로드해 연결이 끊긴 옛 판이다. 예전처럼 「이미 설치됨」 표시만 보고 돌아서면 옛 판이 새 판을 막는다.
(function () {
  "use strict";
  if (globalThis.__rps && typeof globalThis.__rps.teardown === "function") {
    try { globalThis.__rps.teardown(); } catch (_) { /* 연결이 끊긴 옛 판 — 정리 실패는 무시 */ }
  }

  const { linearize, compile, findAll, toRangeSpec } = globalThis.RPS;
  const HL_ALL = "rps-all";
  const HL_CUR = "rps-current";
  const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "TEXTAREA", "INPUT", "SELECT", "OPTION",
    "SVG", "svg", "MATH", "math", "IFRAME", "OBJECT", "CANVAS", "VIDEO", "AUDIO", "IMG"]);
  const BLOCK_DISPLAY = /^(block|flex|grid|list-item|table|table-row|table-caption|table-row-group|table-header-group|table-footer-group|flow-root)$/;

  const state = { ranges: [], texts: [], index: -1, pattern: "", flags: "", opts: null };
  // 같은 페이지 안의 내용 변화(무한 스크롤·「더 보기」 등)를 보고 다시 검색한다. 강조는 CSS Highlight 라서 DOM 을
  // 바꾸지 않으므로 재검색이 다시 변화를 부르지 않는다(스타일 요소 하나는 처음 한 번만 넣는다).
  const RESEARCH_DELAY = 400;   // 변화가 멈춘 뒤 이만큼 기다렸다가
  const RESEARCH_MIN_GAP = 1000; // 재검색끼리는 최소 이만큼 띄운다(계속 바뀌는 페이지에서 과열 방지)
  let observer = null, timer = null, lastRun = 0;

  function styleOf(el) {
    try { return getComputedStyle(el); } catch (_) { return null; }
  }

  const env = {
    skip(el) {
      if (SKIP_TAGS.has(el.nodeName)) return true;
      if (el.hidden) return true;
      const st = styleOf(el);
      return !!st && (st.display === "none" || st.visibility === "hidden" || st.contentVisibility === "hidden");
    },
    boundary(el) {
      const st = styleOf(el);
      if (!st) return null;
      if (st.display === "table-cell") return "cell";
      return BLOCK_DISPLAY.test(st.display) ? "block" : null;
    },
    ws(parent) {
      const st = parent && parent.nodeType === 1 ? styleOf(parent) : null;
      const w = st ? st.whiteSpace : "normal";
      if (w === "pre" || w === "pre-wrap" || w === "break-spaces") return "pre";
      if (w === "pre-line") return "pre-line";
      return "normal";
    },
  };

  function ensureStyle() {
    if (document.getElementById("__rps_style")) return;
    const st = document.createElement("style");
    st.id = "__rps_style";
    st.textContent =
      `::highlight(${HL_ALL}){background-color:#ffe066;color:#000}` +
      `::highlight(${HL_CUR}){background-color:#ff8c1a;color:#000}`;
    (document.head || document.documentElement).appendChild(st);
  }

  function watch() {
    if (observer) return;
    observer = new MutationObserver((records) => {
      if (records.every((r) => r.target.id === "__rps_style" || (r.target.parentNode && r.target.parentNode.id === "__rps_style"))) return;
      clearTimeout(timer);
      const wait = Math.max(RESEARCH_DELAY, lastRun + RESEARCH_MIN_GAP - Date.now());
      timer = setTimeout(research, wait);
    });
    observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  }

  function unwatch() {
    if (observer) observer.disconnect();
    observer = null;
    clearTimeout(timer);
  }

  // 내용이 바뀐 뒤의 재검색: 보던 번호를 유지하고(범위를 넘으면 마지막으로), 스크롤하지 않는다
  function research() {
    if (!state.pattern) return;
    const keep = state.index;
    search(state.pattern, state.opts, { scroll: false, keepIndex: keep });
  }

  function clear() {
    unwatch();
    if (globalThis.CSS && CSS.highlights) {
      CSS.highlights.delete(HL_ALL);
      CSS.highlights.delete(HL_CUR);
    }
    state.ranges = [];
    state.index = -1;
    state.pattern = "";
  }

  function paintCurrent(scroll) {
    if (!(globalThis.CSS && CSS.highlights)) return;
    const r = state.ranges[state.index];
    if (!r) { CSS.highlights.delete(HL_CUR); return; }
    CSS.highlights.set(HL_CUR, new Highlight(r));
    if (scroll === false) return;
    const el = r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentElement;
    const rect = r.getBoundingClientRect();
    if (rect.top < 0 || rect.bottom > innerHeight || rect.left < 0 || rect.right > innerWidth) {
      if (el) el.scrollIntoView({ block: "center", inline: "nearest" });
    }
  }

  function search(pattern, opts, how) {
    how = how || {};
    clear();
    lastRun = Date.now();
    const c = compile(pattern, opts);
    if (c.error) return { error: c.error };
    if (!(globalThis.CSS && CSS.highlights)) return { error: globalThis.RPSt("errNoHighlight", "이 브라우저는 CSS Custom Highlight API를 지원하지 않습니다") };
    const t0 = performance.now();
    const { text, segs } = linearize(document.body || document.documentElement, env);
    const { matches, empty, truncated } = findAll(text, c.re, opts && opts.limit);
    const ranges = [];
    for (const [s, e] of matches) {
      const spec = toRangeSpec(segs, s, e);
      if (!spec) continue;
      const r = document.createRange();
      r.setStart(spec.startNode, spec.startOffset);
      r.setEnd(spec.endNode, spec.endOffset);
      ranges.push(r);
    }
    ensureStyle();
    CSS.highlights.set(HL_ALL, new Highlight(...ranges));
    state.ranges = ranges;
    state.pattern = pattern;
    state.flags = c.flags;
    state.opts = opts || {};
    state.texts = ranges.map((r) => r.toString());
    state.index = !ranges.length ? -1 : how.keepIndex >= 0 ? Math.min(how.keepIndex, ranges.length - 1) : 0;
    paintCurrent(how.scroll);
    watch();
    return { ...status(), empty, truncated, note: c.note, flags: c.flags, ms: Math.round(performance.now() - t0) };
  }

  // 결과가 낡았는가 — 일치 0건이었거나, 칠해 둔 범위의 글자가 칠할 때와 다르다(주소만 바뀌는 사이트·내용 교체).
  // 「노드가 문서에 붙어 있나」로는 못 잡는다: 노드가 지워지면 Range 경계가 부모 요소로 옮겨 붙어 여전히 연결돼 보인다.
  function stale() {
    if (!state.pattern) return false;
    if (!state.ranges.length) return true;
    return state.ranges.some((r, i) => r.startContainer.nodeType !== 3 || r.toString() !== state.texts[i]);
  }

  function refreshIfStale() {
    if (stale()) search(state.pattern, state.opts, { scroll: false, keepIndex: state.index });
  }

  function step(d) {
    if (stale()) {
      // 낡은 결과 사이를 오가지 않고 먼저 다시 검색한다. 다시 찾은 결과의 첫 일치(또는 보던 번호)로 간다
      const r = search(state.pattern, state.opts, { keepIndex: state.index });
      return r;
    }
    const n = state.ranges.length;
    if (!n) return status();
    state.index = (state.index + d + n) % n;
    paintCurrent();
    return status();
  }

  function status() {
    return { count: state.ranges.length, index: state.index, pattern: state.pattern, flags: state.flags, opts: state.opts };
  }

  function onMessage(msg, _sender, reply) {
    try {
      if (msg.type === "search") reply(search(msg.pattern, msg.opts, { scroll: msg.scroll }));
      else if (msg.type === "step") reply(step(msg.delta));
      else if (msg.type === "clear") { clear(); reply(status()); }
      else if (msg.type === "status") { refreshIfStale(); reply(status()); }
    } catch (e) {
      reply({ error: String((e && e.message) || e) });
    }
  }
  chrome.runtime.onMessage.addListener(onMessage);

  globalThis.__rps = {
    teardown() {
      clear();
      try { chrome.runtime.onMessage.removeListener(onMessage); } catch (_) { /* 끊긴 판 */ }
    },
  };
})();
