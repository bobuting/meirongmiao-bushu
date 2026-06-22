# grok-video-3 · 接入文档（才翔AI）

> 本文档由站内"全部复制"按钮一键生成，可直接粘给 Cursor / Claude Code / Cline 等 AI 让它帮你完成接入编码。

## 模型基本信息

- **model**：`grok-video-3`
- **展示名**：grok-video-3
- **类型**：视频生成模型
- **能力标签**：文生视频 · 图生视频 · 首帧参考图 · 1080p · 高清
- **简介**：Grok 推出的首帧参考图视频模型，专注于高效的图生视频体验。支持生成 6 秒及 10 秒时长的 720P 分辨率视频，具备极快的响应速度。它能将静态图像瞬间转化为流畅的动态影像，是短视频创作者快速验证灵感与获取素材的便捷工具。
- **输入提示**：描述视频动作、场景及氛围，上传首帧参考图效果更佳（上传后视频比例将跟图片一致）

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
| `images` | 首帧参考图 | 可选 · 类型`upload` · 最多1 个 | 上传1张图片作为视频首帧（可选，不传则为文生视频） |
| `aspect_ratio` | 画面比例 | **必填** · 类型`enum` | 选择视频的宽高比 |
| `size` | 画质 | **必填** · 类型`enum` | 选择视频画质 |
| `duration` | 视频时长 | **必填** · 类型`enum` | 选择视频时长 |

### 枚举类参数的可选值速查

- `aspect_ratio`：`2:3` / `3:2` / `1:1`
- `size`：`720P` / `1080P`
- `duration`：`6` / `10`

## 1. 创建任务 · 请求示例

```json
{
  "model": "grok-video-3",
  "params": {
    "aspect_ratio": "3:2",
    "duration": "6",
    "images": [
      "https://example.com/reference.png"
    ],
    "size": "1080P"
  },
  "prompt": "A sparkling lake surface, an egret slowly gliding over the water"
}
```

**响应示例（创建成功）**：

```json
{
  "created_at": 1730000000,
  "duration": 5,
  "id": "video_grok3_abc",
  "model": "grok-video-3",
  "object": "video",
  "progress": 0,
  "size": "1280x720",
  "status": "queued"
}
```

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
      "model": "grok-video-3",
      "params": {
        "aspect_ratio": "3:2",
        "duration": "6",
        "images": [
          "https://example.com/reference.png"
        ],
        "size": "1080P"
      },
      "prompt": "A sparkling lake surface, an egret slowly gliding over the water"
    }'

# 2) 轮询任务结果（把 123456 换成上一步返回的 task_id）
curl "https://api.lk888.ai/v1/media/status?task_id=123456" \
  -H "Authorization: Bearer $API_KEY"
```

---

_由才翔AI 开放 API 文档自动生成，可随模型更新重新复制。_
