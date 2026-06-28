# grok-video-3.5 · 接入文档（才翔AI）

> 本文档由站内"全部复制"按钮一键生成，可直接粘给 Cursor / Claude Code / Cline 等 AI 让它帮你完成接入编码。

## 模型基本信息

- **model**：`grok-imagine-video-1.5-preview`
- **展示名**：grok-video-3.5
- **类型**：视频生成模型
- **能力标签**：图生视频 · 首帧参考图 · 自带音频 · 1~15秒 · 高清
- **简介**：xAI 官方 Imagine 1.5 视频模型，专注图生视频：上传一张首帧参考图即可生成 1~15 秒高质量短视频，自带音频，画面比例与时长灵活可控。响应快、成本低，适合用一张图快速生成有声短视频。
- **输入提示**：上传一张首帧参考图，描述你想要的画面动作与运镜（本模型仅支持图生视频，必须上传一张首帧参考图）

## 站点信息

- **BASE_URL**：`https://api.lk888.ai`
- **平台**：才翔AI
- **鉴权**（4 种任一即可）：
  - `Authorization: Bearer $API_KEY`（推荐）
  - `x-api-key: $API_KEY`（Anthropic 风格）
  - `x-goog-api-key: $API_KEY`（Gemini 风格）
  - URL 参数`?key=$API_KEY`
- **模型清单**：`GET https://api.lk888.ai/v1/models` 返回 OpenAI 兼容的模型列表。

## 接口端点

- **创建任务**：`POST https://api.lk888.ai/v1/media/generate`
- **查询任务**：`GET https://api.lk888.ai/v1/media/status?task_id={task_id}`
- **调用流程**：POST 创建→ 拿响应里的`task_id` → 定时 GET 查询→ `is_final=true` 后从`result_url` 拿结果。

## 请求参数

调用`/v1/media/generate` 时参数固定为三个字段：`model` · `prompt` · `params`，其中`params` 内可选项因模型而异：

| 参数名| 显示名| 约束| 描述|
|---|---|---|---|
| `images` | 首帧参考图 | **必填** · 类型`upload` · 最多1 个 | 上传1张图片作为视频首帧（本模型仅支持图生视频，必须上传） |
| `aspect_ratio` | 画面比例 | **必填** · 类型`enum` | 选择视频的宽高比 |
| `resolution` | 画质 | **必填** · 类型`enum` | 选择视频画质 |
| `duration` | 视频时长 | **必填** · 类型`enum` | 选择视频时长（1~15秒，按秒计费） |

### 枚举类参数的可选值速查

- `aspect_ratio`：`16:9` / `9:16` / `1:1` / `3:2` / `2:3`
- `resolution`：`720p` / `480p`
- `duration`：`1` / `2` / `3` / `4` / `5` / `6` / `7` / `8` / `9` / `10` / `11` / `12` / `13` / `14` / `15`

## 1. 创建任务 · 请求示例

```json
{
  "model": "grok-imagine-video-1.5-preview",
  "params": {
    "aspect_ratio": "16:9",
    "duration": "6",
    "images": [
      "https://example.com/reference.png"
    ],
    "resolution": "720p"
  },
  "prompt": "A white egret glides over a sparkling lake at golden hour, with a slow cinematic camera push-in."
}
```

**响应示例（创建成功）**：

```json
{
  "code": 200,
  "data": {
    "task_id": 123456
  },
  "msg": "任务创建成功"
}

{
  "code": 200,
  "msg": "任务创建成功",
  "data": {
    "对话组ID": "202606041619000001",
    "任务ids": [
      123456
    ],
    "成功数量": 1,
    "task_id": 123456
  }
}
```
**响应示例（创建失败）**：

{
  "code": 500,
  "msg": "任务创建失败",
  "data": {
    "失败数量": 1,
    "失败原因": [
      "余额不足"
    ]
  }
}
## 2. 查询任务 · 请求与响应

**请求**：`GET https://api.lk888.ai/v1/media/status?task_id={task_id}`

**响应示例（任务进行中）**：

```json
{
  "task_id": 123456,
  "state": "running",
  "status": "处理中",
  "status_group": "进行中",
  "is_final": false,
  "progress": "45%",
  "result_url": "",
  "result_type": "",
  "error": "",
  "cost": 0
}
```

**响应示例（任务完成，可拿到结果）**：

```json
{
  "task_id": 123456,
  "state": "success",
  "status": "已完成",
  "status_group": "已完成",
  "is_final": true,
  "progress": "100%",
  "result_url": "https://cdn.example.com/output.mp4",
  "result_type": "video",
  "error": "",
  "cost": 0.23
}
```

### 判定规则（AI 接入必看）

- **终态判定**：用`is_final === true`；未终态就继续轮询。
- **成功/失败判定**：用`state`，固定 4 档：`pending` / `running` / `success` / `failed`。
- `status` / `status_group` 是**中文展示字段**（如「已完成」「处理中」「失败」），只给人看，**不要用来写业务判断**。
- 建议每 3~5 秒轮询一次，`state === 'success'` 后从`result_url` 拿结果。`state === 'failed'` 时任务已自动退款。
- 图片任务通常 20 秒~2 分钟；视频任务通常 1~10 分钟；音频任务通常 10 秒~3 分钟（具体因模型和参数而异）。

## cURL 示例

```bash
# 1) 创建任务
curl -X POST "https://api.lk888.ai/v1/media/generate" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
      "model": "grok-imagine-video-1.5-preview",
      "params": {
        "aspect_ratio": "16:9",
        "duration": "6",
        "images": [
          "https://example.com/reference.png"
        ],
        "resolution": "720p"
      },
      "prompt": "A white egret glides over a sparkling lake at golden hour, with a slow cinematic camera push-in."
    }'

# 2) 轮询任务结果（把 123456 换成上一步返回的 task_id）
curl "https://api.lk888.ai/v1/media/status?task_id=123456" \
  -H "Authorization: Bearer $API_KEY"
```

---

_由才翔AI 开放 API 文档自动生成，可随模型更新重新复制。_
