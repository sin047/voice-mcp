export function recordingsPreviewHtml() {
  return String.raw\`<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#f4f5f6">
<title>Shin · Recordings</title>
<style>
:root{color-scheme:light;--bg:#f4f5f6;--paper:rgba(255,255,255,.78);--ink:#343a42;--muted:#858b93;--hair:rgba(92,107,125,.17);--accent:#596675;--danger:#9b6262}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;background:radial-gradient(circle at 8% 3%,#e8ecef 0,transparent 36%),var(--bg);font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Segoe UI",sans-serif;color:var(--ink);font-size:14px}
main{width:min(880px,100%);margin:0 auto;padding:48px 22px 76px}
.kicker{font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:var(--muted)}
header{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;margin:10px 0 26px}
h1{font-family:Georgia,"Times New Roman",serif;font-size:36px;font-weight:400;letter-spacing:-.03em;margin:0}
.subtitle{color:var(--muted);line-height:1.7;margin:8px 0 0}
button,a.button{appearance:none;border:1px solid var(--hair);border-radius:999px;background:rgba(255,255,255,.8);color:var(--ink);font:inherit;text-decoration:none;padding:10px 16px;cursor:pointer}
button:disabled{opacity:.45;cursor:default}
button.danger{color:var(--danger)}
button.small{font-size:12px;padding:7px 12px}
.summary{display:grid;grid-template-columns:1fr auto;gap:18px;align-items:center;background:var(--paper);border:1px solid var(--hair);border-radius:20px;padding:20px 22px;backdrop-filter:blur(16px);box-shadow:0 10px 40px rgba(48,60,73,.035)}
.count{font-family:Georgia,serif;font-size:30px;font-weight:400}
.muted{color:var(--muted)}
.meter{height:5px;border-radius:99px;background:rgba(105,117,130,.12);overflow:hidden;margin-top:12px}
.meter span{display:block;height:100%;width:0;background:#778596;border-radius:99px;transition:width .25s}
.toolbar{display:flex;gap:10px;align-items:center;margin:22px 0 12px}
input[type=search]{flex:1;min-width:0;border:1px solid var(--hair);border-radius:999px;background:rgba(255,255,255,.72);padding:11px 16px;font:inherit;color:var(--ink);outline:none}
#status{font-size:12px;color:var(--muted);min-height:22px;line-height:1.6}
.list{display:grid;gap:12px}
.record{background:var(--paper);border:1px solid var(--hair);border-radius:18px;padding:18px 20px;backdrop-filter:blur(14px)}
.recordtop{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}
.recordtitle{font-size:15px;font-weight:550;overflow-wrap:anywhere}
.recorddate{font-size:11px;color:var(--muted);margin-top:5px}
.tags{display:flex;gap:7px;flex-wrap:wrap;margin:12px 0}
.tag{font-size:10px;color:#727b85;background:rgba(110,124,139,.09);padding:4px 8px;border-radius:99px}
audio{display:block;width:100%;height:38px;margin:12px 0}
.meta{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;border-top:1px solid var(--hair);padding-top:12px;margin-top:10px}
.meta div{min-width:0}.meta b{display:block;font-size:12px;font-weight:500;overflow-wrap:anywhere}.meta span{font-size:10px;color:var(--muted)}
.recordactions{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}
.empty{border:1px dashed var(--hair);border-radius:18px;padding:42px 20px;text-align:center;color:var(--muted);line-height:1.8}
.empty strong{display:block;color:var(--ink);font-weight:500;margin-bottom:5px}
footer{font-size:11px;color:var(--muted);line-height:1.8;margin-top:28px;border-top:1px solid var(--hair);padding-top:16px}
@media(max-width:560px){main{padding:34px 14px 60px}h1{font-size:31px}header{align-items:flex-start;flex-direction:column}.summary{padding:17px}.record{padding:16px}.meta{grid-template-columns:repeat(2,minmax(0,1fr))}.toolbar{gap:7px}button{padding:10px 13px}}
</style>
</head>
<body>
<main>
<div class="kicker">SHIN VOICE / PRIVATE ARCHIVE</div>
<header>
  <div><h1>Recordings</h1><p class="subtitle">声音归档 · 只属于这个实例的私人录音库</p></div>
  <button id="refresh" type="button">刷新列表</button>
</header>
<section class="summary" aria-label="Storage usage">
  <div><div class="muted">已保存录音</div><div class="count" id="count">—</div><div class="muted" id="usageText">正在读取存储用量…</div><div class="meter"><span id="meterFill"></span></div></div>
  <div style="text-align:right"><div class="muted">存储上限</div><div id="capacity" class="count">—</div><div class="muted">WAV archive</div></div>
</section>
<div class="toolbar"><input id="search" type="search" placeholder="搜索标题、台词或录音 ID…" autocomplete="off"><button id="clear" type="button" class="small">清除</button></div>
<div id="status" role="status" aria-live="polite">正在读取录音库…</div>
<section id="list" class="list" aria-label="Recordings list"></section>
<footer>录音保存在服务端配置的持久化目录中。删除操作会同时删除 WAV 文件与元数据，且无法撤销。建议定期将 Volume 内容备份到独立位置。</footer>
</main>
<script type="module">
const $ = (id) => document.getElementById(id);
let recordings = [];
const fmtBytes = (n) => {
  if (!Number.isFinite(Number(n))) return "—";
  const value = Number(n);
  if (value < 1024) return value + " B";
  if (value < 1024 * 1024) return (value / 1024).toFixed(1) + " KB";
  return (value / (1024 * 1024)).toFixed(2) + " MB";
};
const fmtDate = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "日期未知" : new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(date);
};
const setStatus = (message) => { $("status").textContent = message; };
function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = String(text);
  return node;
}
function renderSummary(usage = {}) {
  const count = Number(usage.recordingCount || 0);
  const total = Number(usage.totalBytes || 0);
  const max = Number(usage.maxTotalBytes || 0);
  $("count").textContent = String(count);
  $("usageText").textContent = fmtBytes(total) + " 已使用 · 单条上限 " + fmtBytes(usage.maxRecordingBytes || 0);
  $("capacity").textContent = fmtBytes(max);
  $("meterFill").style.width = (max > 0 ? Math.min(100, total / max * 100) : 0) + "%";
}
function renderList() {
  const list = $("list");
  list.replaceChildren();
  const query = $("search").value.trim().toLocaleLowerCase();
  const visible = recordings.filter((item) => [item.text, item.id, item.fileName, item.performance, item.language].some((value) => String(value || "").toLocaleLowerCase().includes(query)));
  if (!visible.length) {
    const empty = element("div", "empty");
    const title = element("strong", "", query ? "没有找到匹配的录音" : "这里还很安静");
    const detail = element("span", "", query ? "试试其他关键词。" : "通过 voice-mcp 生成并保存的 WAV，会出现在这里。");
    empty.append(title, detail);
    list.append(empty);
    return;
  }
  visible.forEach((item) => {
    const card = element("article", "record");
    const top = element("div", "recordtop");
    const titleBlock = document.createElement("div");
    titleBlock.append(element("div", "recordtitle", item.text || item.fileName || "未命名录音"));
    titleBlock.append(element("div", "recorddate", fmtDate(item.createdAt)));
    top.append(titleBlock);
    const size = element("span", "tag", fmtBytes(item.bytes));
    top.append(size);
    card.append(top);
    const tags = element("div", "tags");
    [item.performance || "unknown", item.language || "auto", Number(item.durationSec || 0).toFixed(1) + " sec", (item.sampleRate || 0) + " Hz", (item.channels || 0) + " ch"].forEach((value) => tags.append(element("span", "tag", value)));
    card.append(tags);
    const audio = document.createElement("audio");
    audio.controls = true;
    audio.preload = "none";
    audio.src = "/recordings/" + encodeURIComponent(item.id);
    audio.setAttribute("aria-label", "播放 " + (item.text || item.fileName));
    card.append(audio);
    const meta = element("div", "meta");
    [[ "Recording ID", item.id ], [ "文件", item.fileName ], [ "来源", item.source || "unknown" ]].forEach(([label, value]) => {
      const cell = document.createElement("div");
      cell.append(element("span", "", label), element("b", "", value));
      meta.append(cell);
    });
    card.append(meta);
    const actions = element("div", "recordactions");
    const download = element("a", "button", "下载 WAV");
    download.href = audio.src;
    download.download = item.fileName || (item.id + ".wav");
    download.className = "button";
    const remove = element("button", "small danger", "删除");
    remove.type = "button";
    remove.addEventListener("click", async () => {
      if (!window.confirm("确定永久删除这条录音吗？此操作无法撤销。")) return;
      remove.disabled = true;
      try {
        const response = await fetch("/recordings/" + encodeURIComponent(item.id), { method: "DELETE", cache: "no-store" });
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.error || ("HTTP " + response.status));
        }
        recordings = recordings.filter((recording) => recording.id !== item.id);
        renderList();
        await load();
        setStatus("录音已删除。");
      } catch (error) {
        remove.disabled = false;
        setStatus("删除失败：" + error.message);
      }
    });
    actions.append(download, remove);
    card.append(actions);
    list.append(card);
  });
}
async function load() {
  $("refresh").disabled = true;
  setStatus("正在读取录音库…");
  try {
    const response = await fetch("/recordings", { cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || ("HTTP " + response.status));
    recordings = Array.isArray(payload.recordings) ? payload.recordings : [];
    renderSummary(payload.usage || {});
    renderList();
    setStatus("已同步 · " + recordings.length + " 条录音");
  } catch (error) {
    setStatus("读取失败：" + error.message + "。请确认已通过私人访问验证后刷新。");
  } finally {
    $("refresh").disabled = false;
  }
}
$("refresh").addEventListener("click", load);
$("search").addEventListener("input", renderList);
$("clear").addEventListener("click", () => { $("search").value = ""; renderList(); });
load();
</script>
</body>
</html>\`;
}
