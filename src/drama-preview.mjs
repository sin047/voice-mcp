export function dramaPreviewHtml() {
  return String.raw`<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Shin · Private Drama Lab</title>
<style>
:root{color-scheme:light;--bg:#f5f6f7;--paper:rgba(255,255,255,.76);--ink:#31373f;--muted:#7f858d;--hair:rgba(92,107,125,.18)}
*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 5% 4%,#e8ecef 0,transparent 38%),var(--bg);font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Segoe UI",sans-serif;color:var(--ink);font-size:14px;min-height:100vh}
main{max-width:790px;margin:0 auto;padding:55px 20px 70px}
.kicker{font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:var(--muted)}
h1{font-family:Georgia,"Times New Roman",serif;font-weight:400;font-size:34px;margin:10px 0}
.sub{line-height:1.8;color:var(--muted);max-width:640px}
section{background:var(--paper);border:1px solid var(--hair);border-radius:21px;padding:24px;margin:20px 0;box-shadow:0 11px 45px rgba(48,60,73,.035);backdrop-filter:blur(15px)}
h2{font-size:13px;font-weight:600;letter-spacing:.03em;margin:0 0 15px}
small,.hint{color:var(--muted);font-size:12px;line-height:1.8}
label{display:block;color:var(--muted);font-size:12px;margin:9px 0 6px}
input[type=file],input[type=number],textarea,select{width:100%;font:inherit;color:var(--ink);border:1px solid var(--hair);border-radius:12px;padding:11px;background:rgba(255,255,255,.7)}
textarea{min-height:76px;resize:vertical;line-height:1.6}input[type=checkbox]{accent-color:#65717e}
.row{display:flex;gap:12px;align-items:end;flex-wrap:wrap}
.row>*{flex:1;min-width:115px}
button{cursor:pointer;border:1px solid var(--hair);border-radius:999px;padding:11px 20px;color:var(--ink);background:white;font:inherit}
button.primary{background:#3e4854;border-color:#3e4854;color:white}
button:disabled{opacity:.45;cursor:default}
button.remove{padding:7px 14px;font-size:12px}
.cue{padding:15px 0;border-top:1px solid var(--hair)}
.cueheader{display:flex;justify-content:space-between;align-items:center;gap:12px;min-width:0}
.cueheader strong{font-weight:500;font-size:12px;overflow-wrap:anywhere}
.cue .row{margin-top:4px}.cue label{font-size:11px}
.actions{display:flex;gap:8px;flex-wrap:wrap}
#status{min-height:24px;font-size:12px;color:#53606b;line-height:1.6}
.privacy{border-top:1px solid var(--hair);padding-top:20px;margin-top:30px}
@media(max-width:480px){main{padding:34px 14px 55px}section{padding:18px}.row>*{min-width:92px}h1{font-size:29px}}
</style>
</head>
<body><main>
<div class="kicker">VOICE MCP / EXPERIMENTAL AUDIO LAB</div>
<h1>Shin · Private Drama</h1>
<p class="sub">本地试听原型 · 一条日语人声轨道 + 独立音效轨道。先验证节奏、距离和音量，再决定哪些效果进入正式 MCP。请戴耳机试听。</p>
<section>
<h2>01 / 人声轨道</h2>
<label for="voice">选择你已有的日语语音文件（MP3 / WAV / M4A）</label>
<input id="voice" type="file" accept="audio/*">
<div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--hair)">
<label for="script">或者直接输入日语台词，由当前 Voice MCP 生成（主动点击才会请求 ElevenLabs）</label>
<textarea id="script" maxlength="700" placeholder="ねえ、すみか。今日は少し、ゆっくり話そう。"></textarea>
<button id="generateVoice" style="margin-top:8px">生成日语人声 · close restrained</button>
</div>
<div class="row"><div><label for="voiceLevel">人声音量（0–1）</label><input id="voiceLevel" type="number" min="0" max="1" step="0.05" value="0.9"></div>
<div><label>建议</label><div class="hint">保留原始人声，不强制添加喘息或情绪标签。</div></div></div>
</section>
<section>
<h2>02 / 音效轨道</h2>
<label for="fx">选择本机音效（最多 12 个，可以多选；文件只留在你的浏览器里）</label>
<input id="fx" type="file" accept="audio/*" multiple>
<div id="cues"></div>
<p class="hint">环境声建议音量 0.10，动作声建议 0.22。左右声像 -1 为左耳，+1 为右耳。循环只适用于环境声。</p>
</section>
<section>
<h2>03 / 混音总线与空间</h2>
<div class="row">
<div><label for="ambienceBusGain">环境音总线（0–1）</label><input id="ambienceBusGain" type="number" min="0" max="1" step="0.05" value="0.82"></div>
<div><label for="foleyBusGain">动作音效总线（0–1）</label><input id="foleyBusGain" type="number" min="0" max="1" step="0.05" value="0.9"></div>
<div><label for="masterGain">总输出（0–1）</label><input id="masterGain" type="number" min="0" max="1" step="0.05" value="0.85"></div>
</div>
<div class="row">
<div><label for="spatialMode">耳机空间模式</label><select id="spatialMode"><option value="stereo">普通立体声 / Stereo</option><option value="hrtf">HRTF 空间定位（单声道音效）</option></select></div>
<div><label for="duckingAmount">人声优先程度（0–1）</label><input id="duckingAmount" type="number" min="0" max="1" step="0.05" value="0.75"></div>
</div>
<label style="display:flex;align-items:center;gap:9px;margin-top:12px"><input id="duckingEnabled" type="checkbox" checked> 人声优先：说话时自动轻压音效，停顿时缓慢恢复</label>
<p class="hint">HRTF 需要耳机；单声道音效可分别设置左右声像与 0.5–8 米距离，距离会通过 inverse distance model 影响远近感。立体声音效保留原始声道，距离控制不作用于它们。</p>
</section>
<section>
<h2>04 / 试听与导出</h2>
<div class="actions">
<button id="preview" class="primary">▶ 试听混音</button>
<button id="stop">■ 停止</button>
<button id="export">导出 WAV</button>
</div>
<p id="status" role="status" aria-live="polite">尚未选择音频。</p>
<small>目前限制：总人声最长 180 秒，最多 12 个音效。HRTF 是浏览器实时空间化，不等于 KU100 实录；最终效果请戴耳机比较。导出 WAV 会进行保守峰值保护。</small>
</section>
<p class="hint privacy">隐私：你从本机选择的语音与音效文件只在浏览器中解码和混音，不会上传到服务器。仅当主动点击「生成日语人声」时，输入的台词才会发送至当前 Voice MCP 和 ElevenLabs，且会消耗 ElevenLabs 额度。仅使用你有权使用的音效素材；不要把私人素材提交到公开 GitHub 仓库。</p>
</main>
<script type="module">
import { createDramaTimeline, createVoiceDuckingEnvelope } from "/drama/timeline.mjs";

const $ = (id) => document.getElementById(id);
let items = [];
let nextId = 1;
let active = null;
let generatedVoiceFile = null;
const status = (message) => { $("status").textContent = message; };

function makeNumber(label, value, min, max, step, change) {
  const wrap = document.createElement("div");
  const caption = document.createElement("label");
  caption.textContent = label;
  const input = document.createElement("input");
  input.type = "number";
  input.min = String(min); input.max = String(max); input.step = String(step);
  input.value = String(value);
  input.addEventListener("input", () => change(Number(input.value)));
  wrap.append(caption, input);
  return wrap;
}

function renderCues() {
  const list = $("cues");
  list.replaceChildren();
  items.forEach((item) => {
    const line = document.createElement("div");
    line.className = "cue";
    const header = document.createElement("div"); header.className = "cueheader";
    const name = document.createElement("strong"); name.textContent = item.file.name;
    const remove = document.createElement("button"); remove.className = "remove";
    remove.textContent = "移除";
    remove.onclick = () => { items = items.filter((i) => i !== item); renderCues(); };
    header.append(name,remove);

    const row = document.createElement("div"); row.className = "row";
    const typeWrap = document.createElement("div");
    const typeLabel = document.createElement("label"); typeLabel.textContent = "类型";
    const type = document.createElement("select");
    [["foley","动作 / foley"],["ambience","环境 / ambience"]].forEach(([value,title]) => {
      const option = document.createElement("option"); option.value=value; option.textContent=title; type.append(option);
    });
    type.value = item.kind;
    type.onchange = () => {
      item.kind = type.value;
      item.gain = item.kind === "ambience" ? 0.1 : 0.22;
      item.fadeInSec = item.kind === "ambience" ? 0.7 : 0.03;
      item.fadeOutSec = item.kind === "ambience" ? 0.7 : 0.07;
      item.loop = item.kind === "ambience";
      renderCues();
    };
    typeWrap.append(typeLabel,type);
    row.append(typeWrap);
    row.append(makeNumber("开始时间 / 秒", item.atSec,0,180,0.1,(v) => {item.atSec=v;}));
    row.append(makeNumber("音量 / 0–0.7", item.gain,0,0.7,0.01,(v) => {item.gain=v;}));
    row.append(makeNumber("左右声像 / -1…1", item.pan,-1,1,0.1,(v) => {item.pan=v;}));
    row.append(makeNumber("距离 / 米（HRTF 单声道）", item.distanceMeters,0.5,8,0.1,(v) => {item.distanceMeters=v;}));
    row.append(makeNumber("淡入 / 秒", item.fadeInSec,0,10,0.05,(v) => {item.fadeInSec=v;}));
    row.append(makeNumber("淡出 / 秒", item.fadeOutSec,0,10,0.05,(v) => {item.fadeOutSec=v;}));
    const loopWrap = document.createElement("div");
    const loopLabel = document.createElement("label"); loopLabel.textContent = "循环";
    const loop = document.createElement("input"); loop.type = "checkbox";
    loop.checked = item.loop;
    loop.disabled = item.kind !== "ambience";
    loop.onchange = () => { item.loop=loop.checked; };
    loopWrap.append(loopLabel,loop);
    row.append(loopWrap);
    line.append(header,row);list.append(line);
  });
}

$("fx").addEventListener("change",(event) => {
  for (const file of event.target.files) {
    if (items.length >= 12) break;
    items.push({
      file,
      fileId: "local_" + nextId++,
      kind: "foley",
      atSec: 0,
      gain: 0.22,
      pan: 0,
      distanceMeters: 1.5,
      fadeInSec: 0.03,
      fadeOutSec: 0.07,
      loop: false,
    });
  }
  event.target.value = "";
  renderCues();
  status("已添加 " + items.length + " 条音效轨道。");
});
$("voice").addEventListener("change",() => {
  generatedVoiceFile = null;
  status($("voice").files[0] ? "已选择人声：" + $("voice").files[0].name : "尚未选择人声。");
});

$("generateVoice").onclick = async() => {
  const text = $("script").value.trim();
  if (!text) { status("请先输入一段要说的日语台词。"); return; }
  $("generateVoice").disabled = true;
  status("正在用已配置的 ElevenLabs 日语音色生成……");
  try {
    const response = await fetch("/speak", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        text,
        language: "ja",
        performance: "close",
        direction: "low, close-mic, gently warm, emotionally restrained, unhurried"
      })
    });
    if (!response.ok) {
      const message = await response.text();
      throw new Error(message.slice(0,240));
    }
    const blob = await response.blob();
    if (!blob.size) throw new Error("ElevenLabs 返回了空音频。");
    generatedVoiceFile = new File([blob], "shin-generated-voice.mp3", { type: "audio/mpeg" });
    status("人声生成成功。可以添加音效并点击「试听混音」。");
  } catch(error) { status("生成失败：" + error.message); }
  finally { $("generateVoice").disabled = false; }
};

async function getBuffers(ctx) {
  const file = generatedVoiceFile || $("voice").files[0];
  if (!file) throw new Error("请先选择一段日语人声音频。");
  const voice = await ctx.decodeAudioData(await file.arrayBuffer());
  if (voice.duration > 180) throw new Error("人声轨道不能超过 180 秒。");
  const timeline = createDramaTimeline({
    voiceDurationSec: voice.duration,
    voiceGain: Number($("voiceLevel").value),
    ambienceBusGain: Number($("ambienceBusGain").value),
    foleyBusGain: Number($("foleyBusGain").value),
    masterGain: Number($("masterGain").value),
    duckingEnabled: $("duckingEnabled").checked,
    duckingAmount: Number($("duckingAmount").value),
    spatialMode: $("spatialMode").value,
    cues: items.map((item) => ({
      fileId: item.fileId,
      kind: item.kind,
      atSec: item.atSec,
      gain: item.gain,
      pan: item.pan,
      distanceMeters: item.distanceMeters,
      loop: item.loop,
      fadeInSec: item.fadeInSec,
      fadeOutSec: item.fadeOutSec,
    })),
  });

  const tracks=[];
  for (const cue of timeline.cues) {
    const item = items.find((i) => i.fileId === cue.fileId);
    const buffer = await ctx.decodeAudioData(await item.file.arrayBuffer());
    tracks.push({cue, buffer});
  }
  return {voice, timeline, tracks};
}

function attachNode(ctx, buffer, at, length, gain, pan, fadeIn, fadeOut, loop, destination, spatialMode, distanceMeters = 1.5) {
  if (length <= 0) return;
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = loop;
  const volume = ctx.createGain();
  let spatialNode = null;

  // HRTF PannerNode is used only for mono effects. Stereo recordings keep
  // their original two-channel image and use StereoPanner when available.
  if (spatialMode === "hrtf" && buffer.numberOfChannels === 1 && typeof ctx.createPanner === "function") {
    try {
      const panner = ctx.createPanner();
      panner.panningModel = "HRTF";
      panner.distanceModel = "inverse";
      panner.refDistance = 1.5;
      panner.maxDistance = 8;
      panner.rolloffFactor = 0.7;
      panner.coneInnerAngle = 360;
      panner.coneOuterAngle = 360;
      panner.coneOuterGain = 1;
      const angle = Math.max(-1, Math.min(1, pan)) * Math.PI / 2;
      const distance = Math.max(0.5, Math.min(8, distanceMeters));
      panner.positionX.value = Math.sin(angle) * distance;
      panner.positionY.value = 0;
      panner.positionZ.value = -Math.cos(angle) * distance;
      panner.orientationX.value = 0;
      panner.orientationY.value = 0;
      panner.orientationZ.value = 1;
      source.connect(volume);
      volume.connect(panner);
      panner.connect(destination);
      spatialNode = panner;
    } catch {
      spatialNode = null;
    }
  }

  if (!spatialNode) {
    const stereoPan = typeof ctx.createStereoPanner === "function" ? ctx.createStereoPanner() : null;
    if (stereoPan) {
      stereoPan.pan.value = pan;
      source.connect(volume);
      volume.connect(stereoPan);
      stereoPan.connect(destination);
    } else {
      source.connect(volume);
      volume.connect(destination);
    }
  }

  const attack = Math.min(length / 2, fadeIn);
  const release = Math.min(length / 2, fadeOut);
  volume.gain.setValueAtTime(attack ? 0 : gain, at);
  if (attack) volume.gain.linearRampToValueAtTime(gain, at + attack);
  const releaseAt = Math.max(at + attack, at + length - release);
  volume.gain.setValueAtTime(gain, releaseAt);
  if (release) volume.gain.linearRampToValueAtTime(0, at + length);
  source.start(at);
  source.stop(at + length);
}

function scheduleVoiceDucking(bus, voiceBuffer, start, baseGain, enabled, amount, settings) {
  const param = bus.gain;
  param.setValueAtTime(baseGain, start);
  if (!enabled || amount <= 0) return;

  const channels = Array.from({ length: voiceBuffer.numberOfChannels }, (_, index) => voiceBuffer.getChannelData(index));
  const envelope = createVoiceDuckingEnvelope(channels, voiceBuffer.sampleRate, {
    amount,
    thresholdDb: settings.thresholdDb,
    attackSec: settings.attackSec,
    releaseSec: settings.releaseSec,
  });
  for (const point of envelope) {
    param.linearRampToValueAtTime(baseGain * point.gain, start + point.atSec);
  }
}
function schedule(ctx, bundle, start) {
  const duration = bundle.timeline.voice.durationSec;
  const mixSettings = bundle.timeline.mix;
  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -6;
  compressor.knee.value = 3;
  compressor.ratio.value = 12;
  compressor.attack.value = 0.003;
  compressor.release.value = 0.18;

  const master = ctx.createGain();
  master.gain.setValueAtTime(mixSettings.masterGain, start);
  compressor.connect(master);
  master.connect(ctx.destination);

  const ambienceBus = ctx.createGain();
  const foleyBus = ctx.createGain();
  ambienceBus.connect(compressor);
  foleyBus.connect(compressor);

  const ducking = mixSettings.ducking;
  scheduleVoiceDucking(
    ambienceBus, bundle.voice, start, mixSettings.ambienceBusGain,
    mixSettings.duckingEnabled, mixSettings.duckingAmount * ducking.ambienceDepth, ducking
  );
  scheduleVoiceDucking(
    foleyBus, bundle.voice, start, mixSettings.foleyBusGain,
    mixSettings.duckingEnabled, mixSettings.duckingAmount * ducking.foleyDepth, ducking
  );

  // Keep the voice centered and in the foreground.
  attachNode(ctx, bundle.voice, start, duration, bundle.timeline.voice.gain, 0, 0.015, 0.12, false, compressor, "stereo");

  bundle.tracks.forEach(({ cue, buffer }) => {
    const remaining = duration - cue.atSec;
    const length = Math.min(remaining, cue.durationSec ?? (cue.loop ? remaining : buffer.duration));
    const bus = cue.kind === "ambience" ? ambienceBus : foleyBus;
    attachNode(
      ctx, buffer, start + cue.atSec, length, cue.gain, cue.pan,
      cue.fadeInSec, cue.fadeOutSec, cue.loop, bus, mixSettings.spatialMode, cue.distanceMeters
    );
  });
}
async function stop() {
  if (active) {
    const old=active;active=null;
    await old.close().catch(() => {});
  }
}

$("stop").onclick = async() => { await stop();status("已停止试听。"); };

$("preview").onclick = async () => {
  $("preview").disabled = true;
  status("正在准备本地混音……");
  try {
    // On iOS/Safari the AudioContext must be unlocked from the actual tap,
    // not after an awaited decode or a previous context close.
    const prior = active;
    active = null;
    if (prior) void prior.close().catch(() => {});
    const ctx = new AudioContext();
    active = ctx;
    const resumed = ctx.resume();
    const bundle = await getBuffers(ctx);
    await resumed;
    schedule(ctx,bundle,ctx.currentTime+.1);
    status("正在播放 · " + bundle.timeline.cues.length + " 条音效轨道");
    const current=ctx;
    setTimeout(() => {
      if (active === current) status("试听完成。");
    },(bundle.voice.duration+.3)*1000);
  } catch(error) {
    await stop();
    status("试听失败：" + error.message);
  } finally { $("preview").disabled=false; }
};

function encodeWav(buffer) {
  const length=buffer.length;
  const left=buffer.getChannelData(0);
  const right=buffer.numberOfChannels>1 ? buffer.getChannelData(1) : left;
  let peak=0;
  for(let i=0;i<length;i++){peak=Math.max(peak,Math.abs(left[i]),Math.abs(right[i]));}
  const scale=peak>0.98 ? 0.98/peak : 1;
  const wav=new ArrayBuffer(44+length*4);
  const view=new DataView(wav);
  const write=(offset,value) => {
    for(let i=0;i<value.length;i++) view.setUint8(offset+i,value.charCodeAt(i));
  };
  write(0,"RIFF"); view.setUint32(4,36+length*4,true);write(8,"WAVE");
  write(12,"fmt ");view.setUint32(16,16,true);
  view.setUint16(20,1,true);view.setUint16(22,2,true);
  view.setUint32(24,buffer.sampleRate,true);view.setUint32(28,buffer.sampleRate*4,true);
  view.setUint16(32,4,true);view.setUint16(34,16,true);
  write(36,"data");view.setUint32(40,length*4,true);
  let off=44;
  for(let i=0;i<length;i++){
    const l=Math.max(-1,Math.min(1,left[i]*scale));
    const r=Math.max(-1,Math.min(1,right[i]*scale));
    view.setInt16(off,l<0?l*32768:l*32767,true);off+=2;
    view.setInt16(off,r<0?r*32768:r*32767,true);off+=2;
  }
  return new Blob([wav],{type:"audio/wav"});
}

$("export").onclick=async()=>{
  $("export").disabled=true;
  status("正在离线混音并导出 WAV……");
  try{
    const tmp=new OfflineAudioContext(2,44100,44100);
    const bundle=await getBuffers(tmp);
    const seconds=bundle.voice.duration+.25;
    const offline=new OfflineAudioContext(2,Math.ceil(seconds*44100),44100);
    schedule(offline,bundle,0);
    const rendered=await offline.startRendering();
    const blob=encodeWav(rendered);
    const url=URL.createObjectURL(blob);
    const anchor=document.createElement("a");
    anchor.href=url;anchor.download="shin-private-drama-preview.wav";
    document.body.append(anchor);anchor.click();anchor.remove();
    setTimeout(()=>URL.revokeObjectURL(url),60000);
    status("导出完成：所有音频都只在本地处理。");
  }catch(error){status("导出失败：" + error.message);}
  finally{$("export").disabled=false;}
};
</script>
</body></html>`;
}
