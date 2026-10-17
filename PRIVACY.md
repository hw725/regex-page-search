# 개인정보처리방침 · Privacy Policy

정규식 페이지 검색(Regex Page Search) · 시행일 2026-10-17

[English below](#english)

## 한국어

이 확장은 어떤 정보도 개발자나 제3자에게 보내지 않는다. 네트워크 요청을 하지 않고, 분석·광고·추적 코드가 없다.

**확장이 다루는 정보**

| 정보 | 쓰는 곳 | 저장 위치 | 지워지는 때 |
|---|---|---|---|
| 웹페이지에 보이는 글자 | 정규식 일치를 찾아 강조 | 저장하지 않음(그 탭의 메모리 안에서만 처리) | 탭을 닫거나 다른 페이지로 옮길 때 |
| 최근에 쓴 검색 패턴(최대 20개)·마지막 검색어와 옵션 | 《최근 사용》 목록, 입력창 채우기 | `chrome.storage.local`(이 기기) | 확장을 지울 때 |
| 즐겨찾기한 검색 패턴(최대 200개, 8KB 이내) | 《즐겨찾기》 목록 | `chrome.storage.sync` — Chrome 동기화를 켰다면 Google이 같은 계정의 다른 기기로 옮긴다 | 목록에서 빼거나 확장을 지울 때 |
| 《이동해도 계속 검색》을 켠 탭 번호와 검색어 | 그 탭이 새 페이지를 열면 다시 검색 | `chrome.storage.session`(메모리) | 《지우기》를 누르거나 체크를 끄거나, 탭이나 브라우저를 닫을 때 |

- 확장은 사용자가 툴바 아이콘이나 단축키로 부른 탭에서만 페이지를 읽는다. 《이동해도 계속 검색》을 켜면, 그 탭에 한해 새 페이지에서도 읽는다. 이 기능을 처음 켤 때 Chrome이 모든 사이트 접근 권한을 묻는다. 허용하지 않아도 나머지 기능은 그대로 쓸 수 있다. 기능을 꺼도 이미 준 권한은 남는다. 거두려면 `chrome://extensions`의 이 확장 《세부정보 › 사이트 액세스》에서 바꾼다.
- 즐겨찾기를 기기 사이에 옮기는 일은 Chrome 동기화가 한다. 그 처리에는 [Google 개인정보처리방침](https://policies.google.com/privacy)이 적용된다.
- 수집하는 정보가 없으므로 판매하거나 공유하는 정보도 없다.

문의: <https://github.com/hw725/regex-page-search/issues>

## English

This extension sends no information to the developer or to any third party. It makes no network requests and contains no analytics, advertising, or tracking code.

**What the extension handles**

| Data | Used for | Stored in | Removed when |
|---|---|---|---|
| Visible text of the web page | Finding and highlighting regex matches | Not stored (processed in that tab’s memory only) | The tab is closed or navigates away |
| Recently used patterns (up to 20), the last pattern and its options | The “Recent” list and refilling the search box | `chrome.storage.local` (this device) | The extension is removed |
| Favorite patterns (up to 200, within 8 KB) | The “Favorites” list | `chrome.storage.sync` — if Chrome sync is on, Google carries it to your other devices signed in to the same account | You remove it from the list or remove the extension |
| Tab ID and pattern for “Keep searching after navigation” | Searching again when that tab loads a new page | `chrome.storage.session` (memory) | You press Clear, uncheck it, or close the tab or browser |

- The extension reads a page only in the tab where you invoke it with the toolbar icon or shortcut. If you turn on “Keep searching after navigation”, it also reads new pages in that tab only. Chrome asks for access to all sites when you first turn this on. If you decline, every other feature still works. Turning the feature off does not revoke a permission you already granted; change it under the extension’s Details › Site access at `chrome://extensions`.
- Chrome sync, not this extension, moves favorites between devices. [Google’s Privacy Policy](https://policies.google.com/privacy) applies to that.
- Because nothing is collected, nothing is sold or shared.

Contact: <https://github.com/hw725/regex-page-search/issues>
