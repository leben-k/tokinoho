/* ===== 設定 ===== */
// スプレッドシートを「ウェブに公開」(CSV) したURLをここに貼ってください
const SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQzneVivgGswej-cvMVhA-Am-HakTOkLC7oS7ck399CP0v0txFFO8UEHYc2fgMGBYK0QNf9ExbJhLH5/pub?gid=305737761&single=true&output=csv";
const PER_PAGE = 10;
// 列の順番: 日付 / 見出し / 本文 / 出典URL
const PALETTE = ["#b91c1c","#1d4ed8","#047857","#c2410c","#7e22ce","#0e7490","#be185d"];
const SAMPLE = [
["2026-10-07","窃盗罪とは（刑法235条）","【どういう法律か】\n他人の財物を盗む行為を処罰する規定です。\n\n【構成要件】\n1. 他人の財物であること\n2. 窃取（相手の意思に反して占有を移すこと）\n3. 故意があること\n4. 不法領得の意思があること\n\n【刑罰】\n10年以下の拘禁刑又は50万円以下の罰金。\n\n※これは一般的な解説です。必ず一次情報（e-Gov法令検索）でご確認ください。",""],
["2026-10-06","名誉毀損罪とは（刑法230条）","【どういう法律か】\n公然と事実を示して、人の社会的評価を下げる行為を処罰します。\n\n【構成要件】\n1. 公然性（不特定又は多数人が認識できる状態）\n2. 事実の摘示（内容が真実かどうかは問いません）\n3. 人の名誉を毀損すること\n4. 故意があること\n\n【刑罰】\n3年以下の拘禁刑又は50万円以下の罰金。",""]
];
/* ===== CSV解析 ===== */
function parseCSV(t){const r=[];let row=[],c="",q=false;for(let i=0;i<t.length;i++){const ch=t[i];
 if(q){if(ch=='"'){if(t[i+1]=='"'){c+='"';i++}else q=false}else c+=ch}
 else if(ch=='"')q=true;else if(ch==','){row.push(c);c=""}
 else if(ch=='\n'){row.push(c);r.push(row);row=[];c=""}else if(ch!='\r')c+=ch}
 if(c||row.length){row.push(c);r.push(row)}return r}
const esc=s=>String(s).replace(/[&<>"]/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[m]));
function tint(hex){return hex+"1f"}
let items=[],view=[],page=1;
function colorOf(i){return PALETTE[i%PALETTE.length]}
async function load(){
 let rows=SAMPLE;
 if(SHEET_CSV_URL){try{const res=await fetch(SHEET_CSV_URL);rows=parseCSV(await res.text());
  if(rows[0]&&/日付|見出し/.test(rows[0].join()))rows.shift()}catch(e){rows=SAMPLE}}
 items=rows.filter(r=>r[1]).map((r,i)=>({d:r[0]||"",h:r[1],b:r[2]||"",u:r[3]||"",id:"a"+i}));
 items.sort((a,b)=>b.d.localeCompare(a.d));
 apply();
 if(location.hash){const k=items.findIndex(x=>x.id==location.hash.slice(1));if(k>=0){page=Math.floor(k/PER_PAGE)+1;render();const e=document.getElementById(items[k].id);if(e){e.open=true;e.scrollIntoView()}}}
}
function apply(){const q=(document.getElementById("q").value||"").trim().toLowerCase();
 view=q?items.filter(x=>(x.h+x.b).toLowerCase().includes(q)):items;page=1;render()}
function render(){
 const list=document.getElementById("list"),n=Math.ceil(view.length/PER_PAGE)||1;
 document.getElementById("count").textContent=view.length+"件の解説";
 list.innerHTML=view.slice((page-1)*PER_PAGE,page*PER_PAGE).map((x,k)=>{const col=colorOf((page-1)*PER_PAGE+k);
  return `<details id="${x.id}" style="--c:${col};--t:${tint(col)}"><summary><span class="chip">見出し</span>${esc(x.h)}<small>${esc(x.d)}</small></summary><div class="body"><div class="lbl">本文</div>${esc(x.b)}${x.u?`<a class="src" href="${esc(x.u)}" target="_blank" rel="noopener">出典・参考リンク</a>`:""}</div></details>`}).join("")||"<p>該当する解説はありません。</p>";
 const p=document.getElementById("pager");p.innerHTML="";
 if(n>1)for(let i=1;i<=n;i++){const b=document.createElement("button");b.textContent=i;if(i==page)b.className="on";b.onclick=()=>{page=i;render();scrollTo(0,0)};p.appendChild(b)}
}
async function counter(){const el=document.getElementById("counter");if(!el)return;
 try{const r=await fetch("https://api.counterapi.dev/v1/leben-k-tokinoho/visits/up");const j=await r.json();el.textContent=Number(j.count).toLocaleString()}catch(e){el.textContent="--"}}
document.addEventListener("DOMContentLoaded",()=>{counter();const hb=document.getElementById("homebtn");if(hb&&document.getElementById("list"))hb.addEventListener("click",e=>{e.preventDefault();document.getElementById("q").value="";apply();history.replaceState(null,"",location.pathname);scrollTo(0,0)});if(document.getElementById("list")){document.getElementById("q").addEventListener("input",apply);load()}});
