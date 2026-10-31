# Shin Voice · 音效响度标准 v1（2026-10-31）

## 原则

人声始终是听觉焦点。背景声让人感受到空间；靠近声提示位置变化；身体接触声能被清晰辨认，但不应盖住台词。**这是一套预设增益参考，不是固定分贝保证。**

真实听感还受原素材响度、片段位置、自动均衡、左右声道、音频设备、总线音量和人声 ducking 影响。因此任何新素材都需经过耳机试听并按素材补偿，不能只看 `gain` 数值。

### 固定标准（cue gain，范围 0–0.7）

| 角色 | 预设值 | 听感目标 | 常见素材 |
| --- | ---: | --- | --- |
| background（连续环境） | **0.48** | 存在感明确，始终低于人声 | 雨、风、室内环境 |
| backgroundDiscrete（零星背景） | **0.25** | 偶尔能听见，不转移注意力 | 远处键盘、环境小响动 |
| approach（逐渐靠近） | **0.34** | 比环境更明显，保留方向感 | 脚步、挪动、从远到近的动作 |
| contact（近身接触） | **0.54** | 衣物、接触纹理清楚，但不能压过台词 | 衣物摩擦、拥抱时的布料 |
| detail（近处细节） | **0.46** | 短促、清晰，有空间位置 | 近距离细微声音 |
| action（物件动作） | **0.20** | 清楚但不突兀，适合点状动作 | 包装撕开、开盒 |
| layered（多层叠加） | **0.12** | 一层不突出，避免多条一起过响 | 复杂分层音效中的一层 |

**先确立音量层级，再给每一条素材个别微调。** 微调使用 `soundscapeGain(role, trimDb)`，音量增益限制在 0–0.7，允许每条 ±12 dB 的校正；这不是把录音自动转成目标 LUFS。

### 已验收基准 / 待试听

- **Rain v2 已验收**：`background = 0.48`；保留雨声和人声的现有比例，不能因为调整其他类别而修改。
- **Close 衣物摩擦 v4 已验收**：用户反馈「能听见，更像脱衣服的声音，不会盖过人声」。保留单素材 cue gain `0.70`、响度补偿目标 RMS `0.14`、左偏声像 `-0.38`；作为衣物摩擦／脱衣物声的参考配置。它是单素材例外，不把所有身体接触音效都设到同样响度。
- **Close 另一条细节**：保留 `detail = 0.46`，避免同时变动多个变量。
- **Package 包装撕开**：用户确认清楚，保持原有 `action` 默认值。
- **Package 盒子开封**：用户反馈不够清楚；本轮单独提高至 `action +2 dB`（cue gain 约 `0.252`），响度补偿目标 RMS `0.14`，距离由 `1.3 m` 调至 `1 m`，片段延长至 `2.2 s`；待再次试听确认。
- **Intimate v1.2（已被 v1.3 替代）**：beta.18 试听反馈为连续节奏、床铺物件声、收尾音效仍不清楚，衣物摩擦略响且人声稍被遮盖。衣物摩擦恢复此前 `layered +0.7 dB = 0.13`；润滑液涂抹保持 `0.274`；连续节奏与床铺物件声提高到 `contact = 0.54`，收尾提高到 `detail = 0.46`，三条单独设 excerpt normalization RMS `0.14`。beta.19/20 的人声优先混音设为 `voiceGain=1.0`、`foleyBusGain=0.82`、`duckingAmount=0.9`、`foleyDuckingDepth=0.55`；试听反馈为人声太突出、节奏和床铺声仍偏小。
- **Intimate v1.3（beta.21，试听通过）**：只提高连续节奏与床铺物件声至 `contact +0.92 dB ≈ 0.60`，两条 excerpt normalization 仍为 RMS `0.14`；其他三条 cue 不动。混音回到中间平衡：`voiceGain=0.96`、`foleyBusGain=0.86`、`duckingAmount=0.84`、`foleyDuckingDepth=0.45`。用户反馈：连续节奏与床铺物件声能听见，整体融合感可以；作为当前 Intimate 候选标准保留，不再额外加大。Rain v2、Close v4、B2.1 不变。
- **Breathy 人声表现（B2.1，已验收）**：使用现有 `voice2-v1.3.1` 的 `performance: "breathy"`。仅在中长语音已有自然停顿处加入明显但自然的 `[inhales]`；不主动插入显式 `[exhales]` 或 `[sighs]`，句尾自然收气，不额外追加一声呼气。短语音或没有自然停顿时不强行加入呼吸，也不要求每句话都出现吸气。保持近讲、温暖、克制的青年音，避免突然拔高音调。更强的 B3 仍是实验级，不得替代 B2.1 成为默认。人声呼吸由 TTS 表现产生，不应伪装成额外 Foley 素材。
- **Expressive 模式注意**：代码中的 `expressive` 仍有独立的 sigh / exhale 实验分支；这不属于已验收的 B2.1 breathy 标准。除非单独试听并验收，不要把它描述成 breathy 默认表现。
- **Approach** 目前为未来素材预留的级别，现有预设没有独立的动态靠近音效，不要把仅调高音量误称为实现了移动音源。
- 其他预设只迁移了参数出处，试听前不宣称已经验收。

### 混音链路

1. 选素材的有效片段，避免截到大段静音；检查声道与立体声录制的真实声像。
2. 按场景角色取得默认 cue gain，必要时做少量 `trimDb` 调整。
3. 保留当前的 ambience RMS boost、foley excerpt boost、声像、fade、ducking 和峰值保护；衣物摩擦可单独指定 `normalizationTargetRms`（默认 `0.10`，本素材 `0.14`，允许范围 `0.05–0.20`）。
4. 双耳试听：先检查「听得到」，再检查「音效是否盖住人声」，最后检查「左右声像和自然程度」。
5. 一次只调整一个主要参数；通过后冻结基准，并记录下个版本的试听结论。

## 代码位置

- `src/soundscape-levels.mjs`：各场景角色的标准音量增益和个别素材 dB 微调。
- `src/soundscape-presets.mjs`：场景预设引用上述标准。
- `src/wav-audio.mjs`：实际混音、分段响度提升、ducking 及防削波；支持场景级 Foley ducking depth。
- `test/soundscape-levels.test.mjs`：固定已通过的雨声基准、身体接触增益和参数有效范围。

> 注意：gain 不等于「相对于人声的百分比」，也不等于最终播放文件的 LUFS；未来增加自动音量匹配时，应单独进行耳机验收。

- **beta.22 播放稳定性修复（试听通过）**：纯 TTS 约 15 秒可完整播放，Intimate 混音音频此前约 6 秒后整段停止。MCP 播放器现先 `fetch()` 完整 WAV、校验非空后转成 Blob URL 再交给 `<audio>` 播放，fetch 失败时保留原 URL 兼容回退。用户确认混音音频现可完整播放至结尾。此改动不改变任何声音增益、cue 时间线或 B2.1 参数。

## beta.25 · 单动作 Foley 预设

用户试听反馈：多个不同动作音效在同一段里连续／交叠出现时，会显得混乱、不自然。新测试方向改为 **一个动作 = 一个固定素材 = 一次单 cue 播放**。

新增单动作标记：
- `[soundscape:clothing]`：只播放「衣物摩擦」，使用已验收的近景素材位置与响度基准，目标片段 6 秒。
- `[soundscape:lubricant]`：只播放「润滑液涂抹」，目标片段 6 秒。
- `[soundscape:rhythm]`：只播放「连续节奏」，目标片段 8 秒。
- `[soundscape:bed]`：只播放「床铺物件声」，目标片段 8 秒。
- `[soundscape:finish]`：只播放「收尾音效」，目标片段 4 秒。

这些是目标上限，不是强制拉伸：当前 mixer 不会把 Foley 人为变速或循环；实际片段长度取「请求时长、源 WAV 可用长度、语音长度」三者最短值。因此若试听仍然偏短，应换用更长的授权素材或补录同一动作的长版本，而不是简单把 duration 数字继续调大。循环只适合稳定、无明显瞬态的环境声，不默认用于动作 Foley。

每次单动作调用只加载一个 Foley cue，不叠加其他动作声；若剧情需要动作变化，先结束当前 cue，再用下一次调用播放另一个固定素材。保留自然淡入淡出、语音 ducking、原素材声像和峰值保护。旧 `[soundscape:intimate]` 五 cue 序列保留作历史对照，但新试听不再使用它。

这一轮没有改动 Rain v2、Close v4 的已验收素材参数、Intimate v1.3 的历史数据或 B2.1 呼吸标准；新单动作预设仍需用户逐条试听验收。

### beta.25 单动作试听记录
- **连续节奏（rhythm）**：用户试听确认「可以」，作为首条单动作 Foley 试听通过。保留当前单 cue、目标 8 秒、gain 与淡入淡出设置；暂不再调整响度或时间参数。
- 下一条建议验收衣物摩擦（clothing），继续一次只测一条素材。
- **衣物摩擦（clothing）**：用户试听确认清晰、连续，有布料移动感，且不会盖过人声。标记为试听通过；保留 beta.25 当前参数（6 秒目标片段、sourceOffsetSec 12、gain 0.70、RMS 0.14、pan -0.38、distance 1 m）。

### beta.26 · 单动作 Foley 自由时长
- 所有单动作标记支持可选秒数：`[soundscape:clothing:10]`、`[soundscape:rhythm:12]`；有效范围 0.1–60 秒。省略秒数时仍使用 beta.25 默认时长。
- 每次只覆盖该 cue 的 `durationSec`，不改变素材、source offset、gain、RMS normalization、pan、distance 或 fades。
- 最终可听长度仍受源 WAV 从 sourceOffset 开始的剩余长度、生成语音长度约束；不足时自动截短，不循环、不变速、不拉伸。
- 此版本只增加调用级时长覆盖，不改动已通过的 Rhythm 与 Clothing 混音参数；Lubricant 等待试听验收。

### beta.27 · Lubricant mix balance adjustment
- 用户反馈 beta.26 的 10 秒润滑液试听中人声存在感太强。仅对 `lubricant` preset 做 A/B 微调：voiceGain 0.86（此前 0.96），foleyBusGain 0.95（此前 0.90），duckingAmount 0.68（此前 0.78），foleyDuckingDepth 0.20（此前 0.35）。
- 润滑液素材本身的 cue gain、目标时长、source offset、pan、distance、fade 均不变。其他预设（尤其已通过的 clothing、rhythm）混音参数不变。
- 验收目标：音效比 beta.26 更靠前，人声略退后但仍清晰可辨；若出现遮盖，回退或小幅修正。

## beta.28 · 独立人声 / Foley 时间轴引擎
- `mixSoundscape` 新增 `voiceSegments` 与 `totalDurationSec`。可在一个总时长内放置多个独立人声片段，并在片段之间保留纯 Foley / ambience 区间。
- 音效不再被最后一段人声的结束时间截断；可在无人声区间继续播放，ducking 参考整条时间轴上的实际人声采样。
- 原 `voicePcm` 调用保持兼容，既有 `speak`、beta.27 的 Lubricant 平衡、已验收 Clothing / Rhythm 参数均不变。
- 本次完成的是混音引擎层与回归测试；尚未新增面向 MCP 用户的时间轴编排工具。下一步在 CI 通过后，新增可提交 `voice` / `foley` / `ambience` / `gap` 片段的 timeline MCP tool。

### beta.29 · MCP 时间轴入口
- 新增 `render_audio_timeline`：统一接收 `duration_sec` 与 `segments`，支持 `voice`、`foley`、`ambience`、`gap` 四类片段。
- `voice` 片段独立调用 TTS 并放置到 `at_sec`；`foley` / `ambience` 使用私有素材库 `asset_id`，可在人声段之间或人声结束后播放；`gap` 保留明确的无声区间。
- 限制：总长最多 60 秒、最多 16 个片段、最多 12 条音效 cue。每个人声片段必须在分配时长内生成完成，不自动加速或截断人声。
- 原 `speak`、`speak_with_soundscape` 及已验收的 Rhythm / Clothing / Lubricant 参数保持不变。
- CI 通过前不部署；实际 MCP 工具清单和 schema 由 Runtime Smoke Test 验证。
