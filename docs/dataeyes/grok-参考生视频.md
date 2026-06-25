# 03-参考图生视频

# 参考图生视频

> **文档版本**：v1.0.0 | **最后更新**：2026-06-11
>
> 本平台已完整适配 Grok (xAI) 官方视频生成接口，请求与响应均为透传，参数语义与官方一致。

通过 1-7 张参考图片引导视频生成的视觉风格（人物身份、产品外观、服装、艺术风格等），参考图不作为首帧。

> 参考图模式最大时长为 10 秒

---

### 创建任务

```
POST https://platform.dataeyes.ai/grok/v1/videos/generations
```

#### 请求头

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|:---|:---|:---:|:---|:---|
| `Content-Type` | string | 是 | application/json | 数据交换格式 |
| `Authorization` | string | 是 |  | 鉴权信息，参考接口鉴权 |

#### 请求体

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|:---|:---|:---:|:---|:---|
| `model` | string | 是 | grok-imagine-video | 模型标识 |
| `prompt` | string | 是 |  | 视频生成的文本提示词<br>可用 `<IMAGE_1>`、`<IMAGE_2>` 等引用对应参考图 |
| `reference_images` | array of string | 是 |  | 参考图片 URL 数组，1-7 张，用于引导视频生成的视觉风格<br>提示词中可用 `<IMAGE_1>`、`<IMAGE_2>` 等引用对应参考图 |
| `duration` | integer | 否 | 8 | 视频时长，单位：秒<br>范围：1-10 |
| `aspect_ratio` | string | 否 | 16:9 | 输出视频宽高比<br>可选值：`1:1`, `16:9`, `9:16`, `4:3`, `3:4`, `3:2`, `2:3` |
| `resolution` | string | 否 | 480p | 输出视频分辨率<br>可选值：`480p`, `720p` |

#### 请求示例

```curl
curl --request POST \
  --url 'https://platform.dataeyes.ai/grok/v1/videos/generations' \
  --header 'Authorization: Bearer <token>' \
  --header 'Content-Type: application/json' \
  --data '{
    "model": "grok-imagine-video",
    "prompt": "一枚水晶能量火箭从火星红色沙丘上发射升空",
    "reference_images": [
      "https://example.com/ref1.jpg",
      "https://example.com/ref2.jpg"
    ],
    "duration": 10,
    "aspect_ratio": "16:9",
    "resolution": "720p"
  }'
```

#### 响应示例

```json
{
  "request_id": "req_abc123def456"
}
```

---

### 查询任务

```
GET https://platform.dataeyes.ai/grok/v1/videos/{request_id}
```

通过 `request_id` 轮询任务状态及结果。

#### 请求头

| 参数 | 类型 | 必填 | 说明 |
|:---|:---|:---:|:---|
| `Authorization` | string | 是 | `Bearer {API_KEY}` |

#### 请求示例

```curl
curl --request GET \
  --url 'https://platform.dataeyes.ai/grok/v1/videos/{request_id}' \
  --header 'Authorization: Bearer <token>'
```

#### 响应示例

**成功（status: done）：**

```json
{
  "status": "done",
  "video": {
    "url": "https://vidgen.x.ai/.../video.mp4",
    "duration": 10,
    "respect_moderation": true
  },
  "model": "grok-imagine-video"
}
```

**处理中（status: pending）：**

```json
{
  "status": "pending",
  "model": "grok-imagine-video"
}
```

**失败：**

```json
{
  "status": "failed",
  "error": {
    "code": "invalid_argument",
    "message": "Prompt cannot be empty. Please provide a prompt."
  }
}
```

#### 查询响应字段

| 字段 | 类型 | 说明 |
|:---|:---|:---|
| `status` | string | 任务状态：`pending`, `done`, `failed`, `expired` |
| `video.url` | string | 生成的视频临时 URL（有效期 24 小时） |
| `video.duration` | integer | 生成视频的时长（秒） |
| `video.respect_moderation` | boolean | 内容是否通过审核；若为 false 则 url 为空 |
| `model` | string | 使用的模型 |
| `error.code` | string | 错误码 |
| `error.message` | string | 错误描述 |

#### 错误处理

当视频生成失败时，响应包含 `error` 对象，含 `code` 和 `message` 字段。可能的错误码如下：

| 错误码 | 含义 | 处理建议 |
|:---|:---|:---|
| `invalid_argument` | 请求参数无效（不支持的时长、无效的图片/视频、提示词过长、冲突的模式，或内容被审核拦截） | 修正请求参数或输入媒体后重新提交 |
| `permission_denied` | API 密钥无权执行请求的操作 | 确认 API 密钥权限 |
| `failed_precondition` | 当前模型或设置不支持请求的操作 | 更改模型、模式、分辨率或其他设置 |
| `service_unavailable` | 视频生成服务暂时过载 | 稍后重试 |
| `internal_error` | 服务内部错误 | 重试请求；如持续失败，携带 request_id 联系支持 |

> 鉴权错误、模型不存在和限流等错误在任务创建前同步返回，不会出现在上述异步错误码中。
