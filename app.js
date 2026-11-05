/* ===== 時の法 トップページの動き =====
   記事一覧は scripts/build.mjs がスプレッドシートから index.html に直接書き込みます。
   このファイルは「検索」「10件ごとの表示切り替え」「#リンクで記事を開く」だけを担当します。
   （全記事がHTMLに入っているので、Googleは2ページ目以降の記事も読めます） */
const PER_PAGE = 10;
let all = [], view = [], page = 1;

function render() {
  const n = Math.ceil(view.length / PER_PAGE) || 1;
  if (page > n) page = n;
  const from = (page - 1) * PER_PAGE, to = page * PER_PAGE;
  all.forEach(d => { d.hidden = true });
  view.forEach((d, k) => { d.hidden = !(k >= from && k < to) });
  document.getElementById("count").textContent = view.length + "件の解説";
  document.getElementById("pageinfo").textContent = n > 1 ? "（" + page + "ページ目／全" + n + "ページ）" : "";
  let empty = document.getElementById("empty");
  if (!view.length && !empty) { empty = document.createElement("p"); empty.id = "empty"; empty.textContent = "該当する解説はありません。"; document.getElementById("list").appendChild(empty) }
  if (empty) empty.hidden = view.length > 0;
  const p = document.getElementById("pager"); p.innerHTML = "";
  if (n > 1) for (let i = 1; i <= n; i++) {
    const b = document.createElement("button"); b.textContent = i; if (i == page) b.className = "on";
    b.onclick = () => { page = i; render(); scrollTo(0, document.getElementById("list").offsetTop - 80) };
    p.appendChild(b);
  }
}
/* 検索用に文字をそろえる：全角英数→半角、大文字→小文字、カタカナ→ひらがな、空白を除く */
function norm(s) {
  return String(s || "").normalize("NFKC").toLowerCase()
    .replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .replace(/\s+/g, "");
}
/* 1記事ぶんの検索対象＝見出し＋日付＋本文（「見出し」「本文」などの飾り文字は除く） */
function searchText(d) {
  const h = d.querySelector("summary h3"), date = d.querySelector("summary small"), body = d.querySelector(".body");
  let t = (h ? h.textContent : "") + " " + (date ? date.textContent : "");
  if (body) {
    const c = body.cloneNode(true);
    c.querySelectorAll(".lbl,.more,.src").forEach(e => e.remove());
    t += " " + c.textContent;
  }
  return norm(t);
}
let lastQ = null;
function apply() {
  const raw = document.getElementById("q").value || "";
  // 空白（全角スペースも）で区切った言葉を、すべて含む記事を表示
  const words = raw.normalize("NFKC").split(/\s+/).map(norm).filter(Boolean);
  const key = words.join(" ");
  if (key === lastQ) return; lastQ = key;
  view = words.length ? all.filter(d => words.every(w => d._s.includes(w))) : all.slice();
  page = 1; render();
}
function openHash() {
  const id = decodeURIComponent(location.hash.slice(1)); if (!id) return;
  const k = view.findIndex(d => d.id == id); if (k < 0) return;
  page = Math.floor(k / PER_PAGE) + 1; render();
  view[k].open = true; view[k].scrollIntoView();
}
async function counter() {
  const el = document.getElementById("counter"); if (!el) return;
  try { const r = await fetch("https://api.counterapi.dev/v1/leben-k-tokinoho/visits/up"); const j = await r.json(); el.textContent = Number(j.count).toLocaleString() } catch (e) { el.textContent = "--" }
}
document.addEventListener("DOMContentLoaded", () => {
  counter();
  const list = document.getElementById("list"); if (!list) return;
  all = [...list.querySelectorAll("details")];
  all.forEach(d => { d._s = searchText(d) });
  const q = document.getElementById("q");
  // 日本語入力の確定・×ボタンでの消去・貼り付けでも確実に検索する
  ["input", "compositionend", "change", "search", "keyup"].forEach(ev => q.addEventListener(ev, apply));
  q.closest("form")?.addEventListener("submit", e => { e.preventDefault(); apply() });
  const hb = document.getElementById("homebtn");
  if (hb) hb.addEventListener("click", e => { e.preventDefault(); document.getElementById("q").value = ""; lastQ = null; apply(); history.replaceState(null, "", location.pathname); scrollTo(0, 0) });
  apply(); openHash();
  addEventListener("hashchange", openHash);
});
