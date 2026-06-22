# veo3.1 · 接入文档（才翔AI）

> 本文档由站内"全部复制"按钮一键生成，可直接粘给 Cursor / Claude Code / Cline 等 AI 让它帮你完成接入编码。

## 模型基本信息

- **model**：`veo3.1`
- **展示名**：veo3.1
- **类型**：视频生成模型
- **能力标签**：文生视频 · 图生视频 · 首帧参考图 · 首尾帧 · 高清
- **简介**：谷歌推出的高可控性视频模型，凭借独特的“首尾帧控制”技术（补全起始与结束画面）和精准运镜指令，能生成自带背景音乐的专业级视频。
- **输入提示**：提示词建议：主体+动作+场景+运镜。上传参考图锁定人物与画风；首帧图开启图生视频；首尾帧两张图精准控制起始与结束

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
| `generation_mode` | 生成模式 | **必填** · 类型`enum` | 选择生成速度和质量 |
| `aspect_ratio` | 视频比例 | **必填** · 类型`enum` | 选择视频的宽高比 |
| `images` | 参考图片 | 可选 · 类型`upload` · 最多3 个 | 上传参考图片（首帧/首尾帧/元素合一需要） |
| `enhance_prompt` | 提示词优化 | **必填** · 类型`bool` | veo仅支持英文提示词，开启后自动翻译中文 |
| `enable_upsample` | 视频超分 | **必填** · 类型`bool` | 开启后视频分辨率更高 |
| `duration` | 时长 | 可选 · 类型`enum` | 视频生成时长 |
| `generation_type` | 生成方式 | 可选 · 类型`enum` | 视频生成方式 |
| `quality` | 清晰度 | 可选 · 类型`enum` | 视频清晰度 |

### 枚举类参数的可选值速查

- `generation_mode`：`fast` / `null` / `pro` / `components`
- `aspect_ratio`：`9:16` / `16:9`
- `images`：`first_frame` / `first_last_frame` / `components`
- `enhance_prompt`：`true` / `false`
- `enable_upsample`：`true` / `false`
- `duration`：`8`
- `generation_type`：`TEXT` / `REFERENCE` / `FIRST&LAST`
- `quality`：`1080p`

### 参数联动规则（调用时必须遵守）

> `show / hide`：参数是否生效；`enable / disable`：参数是否允许传；`auto_select`：两个参数必须同时出现；`auto_exclude`：两个参数**不能**同时出现（互斥，会报错）。

- **[必选组合]** 选择多图参考时，自动选中参考图片
- **[必选组合]** 选择参考图片时，自动选中多图参考
- **[互斥（不能同时传）]** 选择首帧参考图时，自动排除多图参考
- **[互斥（不能同时传）]** 选择首尾帧时，自动排除多图参考

## 1. 创建任务 · 请求示例

```json
{
  "model": "veo3.1",
  "params": {
    "aspect_ratio": "16:9",
    "duration": "8",
    "enable_upsample": true,
    "enhance_prompt": true,
    "generation_mode": "fast",
    "generation_type": "TEXT",
    "images": [
      "https://example.com/reference.png"
    ],
    "quality": "1080p"
  },
  "prompt": "A sparkling lake surface, an egret slowly gliding over the water"
}
```

**响应示例（创建成功）**：

```json
{
  "name": "models/veo-3.1-generate-preview/operations/abc123-def456"
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
      "model": "veo3.1",
      "params": {
        "aspect_ratio": "16:9",
        "duration": "8",
        "enable_upsample": true,
        "enhance_prompt": true,
        "generation_mode": "fast",
        "generation_type": "TEXT",
        "images": [
          "https://example.com/reference.png"
        ],
        "quality": "1080p"
      },
      "prompt": "A sparkling lake surface, an egret slowly gliding over the water"
    }'

# 2) 轮询任务结果（把 123456 换成上一步返回的 task_id）
curl "https://api.lk888.ai/v1/media/status?task_id=123456" \
  -H "Authorization: Bearer $API_KEY"
```

---

_由才翔AI 开放 API 文档自动生成，可随模型更新重新复制。_
