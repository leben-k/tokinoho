// =============================================================
// 時の法 記事ページ自動生成スクリプト
//   スプレッドシート(CSV) → articles/*.html ＋ index.html の一覧 ＋ sitemap.xml
//   使い方:  SHEET_CSV_URL="https://docs.google.com/...output=csv" node scripts/build.mjs
//   URLを指定しない場合は data/articles.csv を読み込みます。
//   追加ライブラリは不要です（Node.js 18以上）。
// =============================================================
import { readFile, writeFile, mkdir, readdir, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* ===== 設定 ===== */
const SITE_URL = "https://leben-k.github.io/tokinoho/"; // 末尾は / で終える
const SITE_NAME = "時の法";
const PUBLISHER = "地域情報室";
const PALETTE = ["#b91c1c", "#1d4ed8", "#047857", "#c2410c", "#7e22ce", "#0e7490", "#be185d"];
// スプレッドシートの列: A日付 / B見出し / C本文 / D出典URL / E URL名（任意・半角英数字とハイフン）

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ART_DIR = path.join(ROOT, "articles");
const LOCAL_CSV = path.join(ROOT, "data", "articles.csv");

/* ===== 小道具 ===== */
const esc = s => String(s).replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
const jsonLd = o => JSON.stringify(o).replace(/</g, "\\u003c");
const isHttp = u => /^https?:\/\/\S+$/i.test(u);

function parseCSV(t) {
  t = t.replace(/^﻿/, "");
  const r = []; let row = [], c = "", q = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) { if (ch == '"') { if (t[i + 1] == '"') { c += '"'; i++ } else q = false } else c += ch }
    else if (ch == '"') q = true;
    else if (ch == ",") { row.push(c); c = "" }
    else if (ch == "\n") { row.push(c); r.push(row); row = []; c = "" }
    else if (ch != "\r") c += ch;
  }
  if (c || row.length) { row.push(c); r.push(row) }
  return r;
}

// 2026/10/7, 2026-10-07, 2026年10月7日 → 2026-10-07
function normDate(s) {
  const m = String(s).trim().match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
  return m ? `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}` : "";
}
const jpDate = d => { const [y, m, dd] = d.split("-"); return `${y}年${+m}月${+dd}日` };

// URL名：E列があればそれを使い、なければ「日付-見出しから作った短い記号」
function makeSlug(date, title, given) {
  const g = String(given || "").trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  if (g) return g;
  const h = createHash("sha1").update(title.trim()).digest("hex").slice(0, 6);
  return `${date || "nodate"}-${h}`;
}

// 本文 → HTML。【○○】だけの行は見出し(h2)、空行で段落を区切る
function bodyToHtml(b) {
  const out = []; let para = [];
  const flush = () => { if (para.length) { out.push(`<p>${para.map(esc).join("<br>")}</p>`); para = [] } };
  for (const raw of b.replace(/\r/g, "").split("\n")) {
    const line = raw.trimEnd();
    const h = line.trim().match(/^【(.+)】$/);
    if (h) { flush(); out.push(`<h2>${esc(h[1])}</h2>`) }
    else if (!line.trim()) flush();
    else para.push(line);
  }
  flush();
  return out.join("\n");
}

// 検索結果に出る説明文（本文の先頭 約110字）
function makeDesc(b) {
  const t = b.replace(/【[^】]*】/g, " ").replace(/\s+/g, " ").trim();
  return t.length > 110 ? t.slice(0, 109) + "…" : t;
}

/* ===== データ読み込み ===== */
async function loadRows() {
  const url = (process.env.SHEET_CSV_URL || "").trim();
  let text;
  if (url) {
    const res = await fetch(url, { redirect: "follow" });
    if (!res.ok) throw new Error(`スプレッドシートを取得できませんでした (HTTP ${res.status})`);
    text = await res.text();
    if (/^\s*<(!doctype|html)/i.test(text)) throw new Error("CSVではなくHTMLが返ってきました。「ウェブに公開」でCSV形式を選んだURLか確認してください。");
    console.log("スプレッドシートから読み込み:", url);
  } else if (existsSync(LOCAL_CSV)) {
    text = await readFile(LOCAL_CSV, "utf8");
    console.log("ローカルCSVから読み込み:", path.relative(ROOT, LOCAL_CSV));
  } else {
    throw new Error("SHEET_CSV_URL も data/articles.csv もありません。");
  }
  const rows = parseCSV(text);
  if (rows[0] && /日付|見出し/.test(rows[0].join())) rows.shift();
  return rows;
}

function toItems(rows) {
  const items = [], seen = new Map();
  for (const r of rows) {
    const title = (r[1] || "").trim();
    if (!title) continue;
    const date = normDate(r[0] || "");
    let slug = makeSlug(date, title, r[4]);
    if (seen.has(slug)) { const n = seen.get(slug) + 1; seen.set(slug, n); slug = `${slug}-${n}` } else seen.set(slug, 1);
    const src = (r[3] || "").trim();
    items.push({ date, title, body: (r[2] || "").trim(), src: isHttp(src) ? src : "", slug });
  }
  // 新しい日付が上。同じ日付ならスプレッドシートで下にある行を上に
  return items.map((x, i) => ({ ...x, i })).sort((a, b) => b.date.localeCompare(a.date) || b.i - a.i);
}

/* ===== 共通パーツ ===== */
const footer = p => `<footer><p>運営：${PUBLISHER}</p>
<p><a href="${p}./">ホーム</a>｜<a href="${p}contact.html">連絡先</a>｜<a href="${p}privacy.html">プライバシーポリシー</a></p>
<p>© ${PUBLISHER}「${SITE_NAME}」。掲載内容は一般的な情報提供であり、個別の法的助言ではありません。</p></footer>`;

/* ===== 記事ページ ===== */
function articlePage(x, prev, next, k) {
  const url = `${SITE_URL}articles/${x.slug}.html`;
  const title = `${x.title}｜${SITE_NAME}`;
  const desc = makeDesc(x.body) || `${x.title}について、どんな法律か・構成要件・刑罰をわかりやすく解説します。`;
  const col = PALETTE[k % PALETTE.length];
  const ld = [{
    "@context": "https://schema.org", "@type": "Article",
    headline: x.title.slice(0, 110), description: desc, inLanguage: "ja",
    ...(x.date && { datePublished: x.date, dateModified: x.date }),
    mainEntityOfPage: url, url,
    author: { "@type": "Organization", name: PUBLISHER },
    publisher: { "@type": "Organization", name: PUBLISHER, logo: { "@type": "ImageObject", url: `${SITE_URL}favicon.svg` } }
  }, {
    "@context": "https://schema.org", "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: SITE_NAME, item: SITE_URL },
      { "@type": "ListItem", position: 2, name: x.title, item: url }
    ]
  }];
  return `<!DOCTYPE html>
<html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${url}">
<link rel="icon" href="../favicon.svg" type="image/svg+xml">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">
<meta property="og:type" content="article"><meta property="og:url" content="${url}">
<meta property="og:site_name" content="${SITE_NAME}"><meta property="og:locale" content="ja_JP">
<meta property="og:image" content="${SITE_URL}favicon.svg">
${x.date ? `<meta property="article:published_time" content="${x.date}">\n` : ""}<link rel="stylesheet" href="../style.css">
<script type="application/ld+json">${jsonLd(ld)}</script></head><body>
<header id="top"><div class="wrap"><img src="../favicon.svg" alt="時の法のロゴ"><div><p class="site"><a href="../">${SITE_NAME}</a></p><p>～時事の話題を簡単に綴ります～</p></div></div></header>
<nav><div class="wrap"><a href="../">ホーム</a><span class="crumb">› 記事</span></div></nav>
<main><div class="wrap">
<article class="post" style="--c:${col};--t:${col}1f">
<div class="post-head"><span class="chip">見出し</span><h1>${esc(x.title)}</h1>${x.date ? `<time datetime="${x.date}">${jpDate(x.date)}</time>` : ""}</div>
<div class="post-body">
${bodyToHtml(x.body)}
${x.src ? `<p><a class="src" href="${esc(x.src)}" target="_blank" rel="noopener">出典・参考リンク</a></p>` : ""}
</div>
</article>
<p class="warn">掲載内容は一般的な情報提供であり、個別の法的助言ではありません。</p>
<nav class="pn" aria-label="前後の記事">
${prev ? `<a class="pn-prev" href="${prev.slug}.html"><small>← 前の記事</small>${esc(prev.title)}</a>` : "<span></span>"}
${next ? `<a class="pn-next" href="${next.slug}.html"><small>後の記事 →</small>${esc(next.title)}</a>` : "<span></span>"}
</nav>
<div class="back"><a class="btn" href="#top">▲ このページの先頭へ</a><a class="btn" href="../">🏠 記事一覧へ</a></div>
</div></main>
${footer("../")}
</body></html>
`;
}

/* ===== トップページの一覧（index.html の目印の間を差し替え） ===== */
function listHtml(items) {
  if (!items.length) return "<p>該当する解説はありません。</p>";
  return items.map((x, k) => {
    const col = PALETTE[k % PALETTE.length];
    return `<details id="${x.slug}" style="--c:${col};--t:${col}1f"><summary><span class="chip">見出し</span><h3>${esc(x.title)}</h3>${x.date ? `<small>${esc(x.date)}</small>` : ""}</summary><div class="body"><div class="lbl">本文</div>${esc(x.body)}${x.src ? `<a class="src" href="${esc(x.src)}" target="_blank" rel="noopener">出典・参考リンク</a>` : ""}<a class="more" href="articles/${x.slug}.html">この記事のページを開く →</a></div></details>`;
  }).join("\n");
}

async function updateIndex(items) {
  const file = path.join(ROOT, "index.html");
  let html = await readFile(file, "utf8");
  const S = "<!--ARTICLES:START-->", E = "<!--ARTICLES:END-->";
  if (!html.includes(S) || !html.includes(E)) throw new Error("index.html に <!--ARTICLES:START--> と <!--ARTICLES:END--> の目印がありません。");
  html = html.replace(new RegExp(`${S}[\\s\\S]*?${E}`), `${S}\n${listHtml(items)}\n${E}`);
  // ItemList（記事一覧）の構造化データも更新
  const ld = jsonLd({
    "@context": "https://schema.org", "@type": "ItemList",
    itemListElement: items.map((x, i) => ({ "@type": "ListItem", position: i + 1, url: `${SITE_URL}articles/${x.slug}.html`, name: x.title }))
  });
  html = html.replace(/<script type="application\/ld\+json" id="itemlist">[\s\S]*?<\/script>/, `<script type="application/ld+json" id="itemlist">${ld}</script>`);
  await writeFile(file, html);
}

/* ===== サイトマップ ===== */
async function writeSitemap(items) {
  const newest = items.find(x => x.date)?.date || new Date().toISOString().slice(0, 10);
  const u = (loc, lastmod, freq, pri) => `  <url><loc>${loc}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ""}<changefreq>${freq}</changefreq><priority>${pri}</priority></url>`;
  const lines = [
    u(SITE_URL, newest, "daily", "1.0"),
    ...items.map(x => u(`${SITE_URL}articles/${x.slug}.html`, x.date, "monthly", "0.8")),
    u(`${SITE_URL}contact.html`, "2026-10-07", "yearly", "0.3"),
    u(`${SITE_URL}privacy.html`, "2026-10-07", "yearly", "0.3")
  ];
  await writeFile(path.join(ROOT, "sitemap.xml"),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${lines.join("\n")}\n</urlset>\n`);
}

/* ===== 実行 ===== */
const items = toItems(await loadRows());
if (!items.length) throw new Error("記事が0件でした。スプレッドシートの内容を確認してください（誤って全部消えるのを防ぐため中止します）。");

await mkdir(ART_DIR, { recursive: true });
const keep = new Set();
for (let k = 0; k < items.length; k++) {
  const x = items[k], name = `${x.slug}.html`;
  keep.add(name);
  await writeFile(path.join(ART_DIR, name), articlePage(x, items[k + 1], items[k - 1], k));
}
// スプレッドシートから消した記事のページは削除
for (const f of await readdir(ART_DIR)) if (f.endsWith(".html") && !keep.has(f)) await unlink(path.join(ART_DIR, f));

await updateIndex(items);
await writeSitemap(items);
console.log(`完了：記事 ${items.length} 件を生成しました。`);
