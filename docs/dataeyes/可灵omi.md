# 03-视频Omni

# Omni-Video

> **文档版本**：v1.0.0 | **最后更新**：2026-06-11
>
> 本平台已完整适配可灵 AI 系列官方视频生成接口，请求与响应均为透传，参数语义与官方一致。

### 创建任务

```
POST https://platform.dataeyes.ai/kling/v1/videos/omni-video
```

Omni 模型可以通过 Prompt 结合元素、图片、视频等内容实现多种能力。

#### 请求头

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|:---|:---|:---:|:---|:---|
| `Content-Type` | string | 是 | application/json | 数据交换格式 |
| `Authorization` | string | 是 |  | 鉴权信息，参考接口鉴权 |

#### 请求体

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|:---|:---|:---:|:---|:---|
| `model_name` | string | 否 | kling-video-o1 | 模型名称<br>可选值: `kling-video-o1`, `kling-v3-omni` |
| `multi_shot` | boolean | 否 | false | 是否生成多镜头视频。<br>当前参数为 true 时，prompt 参数无效。<br>当前参数为 false 时，shot_type 参数及 multi_prompt 参数无效。 |
| `shot_type` | string | 否 |  | 分镜方式。<br>可选值: `customize`, `intelligence`<br>当 multi_shot 参数为 `true` 时，当前参数必填。 |
| `prompt` | string | 否 |  | 文本提示词，可包含正向描述和负向描述。<br>- 可将提示词模板化来满足不同的视频生成需求<br>- 不能超过 2,500 个字符<br>当 "multi_shot 为 `false` "或" multi_shot参数为`true`且shot-type参数为`intelligence`"时，当前参数不得为空。<br>Omni模型可通过Prompt与主体、图片、视频等内容实现多种能力：<br>- 通过<<<>>>的格式来指定某个主体、图片或视频，如：<<<element_1>>>、<<<image_1>>>、<<<video_1>>><br>- 能力范围详见使用手册：[可灵Omni模型使用指南](https://docs.qingque.cn/d/home/eZQCg5xHvxDaE-jP2GcnaNc6O?identityId=2Cn18n4EIHT)、[可灵视频 3.0 Omni 使用指南](https://docs.qingque.cn/d/home/eZQDPQ5RCKYKpTbz1poE88YSp?identityId=2Cn18n4EIHT)<br>不同模型版本、视频模式支持范围不同，详见 能力地图 |
| `multi_prompt` | array | 否 |  | 各分镜信息，如提示词、时长等。<br>通过 index、prompt、duration 参数定义分镜序号及相应提示词和时长。<br>- 最多支持 6 个分镜，最小支持 1 个分镜。<br>- 每个分镜相关内容的最大长度不超过 512。<br>- 每个分镜的时长不大于当前任务的总时长，不小于 1。<br>- 所有分镜的时长之和等于当前任务的总时长。<br>当 multi_shot 为 true 且 shot_type 为 customize 时，当前参数不得为空。格式如下： |
| `image_list` | array | 否 |  | 参考图列表，包括主体、场景、风格等参考图片。<br>- 包括主体、场景、风格等参考图片，也可作为首帧或尾帧生成视频；当作为首帧或尾帧生成视频时：<br>  - 通过 `type` 参数来定义图片是否为首尾帧：`first_frame` 为首帧，`end_frame` 为尾帧；其中：<br>    - 如图片非首帧或尾帧，请勿配置 `type` 参数<br>    - 暂时不支持仅尾帧，即有尾帧图时必须有首帧图<br>  - 首帧或首尾帧生视频时，不能使用视频编辑功能<br>用 key:value 承载，如下：<br>**图片要求：**<br>- 支持传入图片Base64编码或图片URL（确保可访问）<br>- 格式：.jpg / .jpeg / .png<br>- 文件大小：≤10MB<br>- 尺寸：宽和高都不小于300px，宽高比1:2.5 ~ 2.5:1<br>- 参考图片数量与参考主体数量和参考主体类型有关，其中：<br>   - 无参考视频+仅有多图主体时，参考图片与多图主体数量之和不得超过7；<br>**数量限制：**<br>- 参考图片数量与参考主体数量和参考主体类型有关，其中：<br>   - 无参考视频+仅有多图主体时，参考图片与多图主体数量之和不得超过7；<br>    - 无参考视频+有视频主体时，参考图片与多图主体数量之和不得超过4；<br>   - 有参考视频+仅有多图主体时，参考图片与多图主体数量之和不得超过4；<br>- 使用`kling-video-o1`模型时，数组中超过2张图片时，不支持设置首尾帧<br>- `image_url` 参数值不得为空 |
|   `image_url` | string | 是 |  | 图片 URL 或 Base64 |
|   `type` | string | 否 |  | 帧类型：first_frame 为首帧，end_frame 为尾帧<br>可选值: `first_frame`, `end_frame` |
| `element_list` | array | 否 |  | 主体参考列表，基于主体库中主体的ID配置。<br>- 用 key:value 承载，格式如下：<br>- 主体分为视频定制主体（简称：视频角色主体）和图片定制主体（简称：多图主体），适用范围不同，请注意区分<br>- 参考主体数量与主体类型、有无参考视频、参考图片数量等因素有关，其中：<br>  - 当使用首帧或首尾帧生成视频时，`kling-v3-omni`模型最多支持3个主体；<br>  - 当使用首尾帧生成视频时，`kling-video-o1`模型不支持主体；<br>  - 无参考视频+仅有多图主体时，参考图片与多图主体数量之和不得超过7；<br>  - 无参考视频+仅有视频角色主体时，视频角色主体数量不得超过3；<br>  - 无参考视频+同时有视频角色主体和多图主体时，视频角色主体数量不得超过3，参考图片与多图主体数量之和不得超过4；<br>  - 有参考视频+仅有多图主体时，参考图片与多图主体数量之和不得超过4；<br>  - 有参考视频时，不支持使用视频角色主体；<br>更多主体信息详见：[可灵「主体库 3.0」使用指南](https://docs.qingque.cn/d/home/eZQCXlb985uYAZ-c8NgyTv11X?identityId=2Cn18n4EIHT#section=h.ihbooeem1vo)。<br>不同模型版本、视频模式支持范围不同，详见 能力地图 |
|   `element_id` | long | 是 |  | 主体库中的主体 ID |
| `video_list` | array | 否 |  | 参考视频，通过URL方式获取。<br>**视频类型：**<br>- 可作为特征参考视频，也可作为待编辑视频，默认为待编辑视频<br>- 通过 `refer_type` 参数区分参考视频类型：`feature` 为特征参考视频，`base` 为待编辑视频<br>- 参考视频为待编辑视频时，不能定义视频首尾帧<br>- 通过 `keep_original_sound` 参数选择是否保留视频原声：`yes` 保留，`no` 不保留（对 feature 类型也生效）<br>有参考视频时，sound 参数值只能为 off。<br>用 key:value 承载，格式如下：<br>**视频要求：**<br>- 格式：仅支持 MP4/MOV<br>- 时长：不少于 3 秒，上限与模型版本有关，详见能力地图<br>- 分辨率：720px-2160px（宽高尺寸）<br>- 帧率：24-60fps（生成视频时会输出为 24fps）<br>- 至多 1 段视频，大小≤200MB<br>- `video_url` 参数值不得为空<br>不同模型版本、视频模式支持范围不同，详见 能力地图 |
|   `video_url` | string | 是 |  | 视频 URL |
|   `refer_type` | string | 否 | base | 参考类型：feature（特征参考视频）或 base（待编辑视频）<br>可选值: `feature`, `base`<br>- `base` - 指令变换（视频编辑）：<br>视频编辑，例如增加/删除/修改内容（主体/背景/局部/视频风格/物体颜色/天气等），切换景别/视角。<br>- `feature` - 视频参考：<br>参考视频内容生成下一个镜头/上一个镜头，或者参考视频的风格/运镜方式进行视频生成。 |
|   `keep_original_sound` | string | 否 |  | 保留原声：yes 保留，no 不保留<br>可选值: `yes`, `no` |
| `sound` | string | 否 | off | 生成视频时是否同时生成声音。<br>可选值: `on`, `off`<br>不同模型版本、视频模式支持范围不同，详见 能力地图 |
| `mode` | string | 否 | pro | 生成视频的模式<br>可选值: `std`, `pro`, `4k`<br>- `std`：标准模式（标准），基础模式，性价比高，输出视频分辨率为720P。<br>- `pro`：专家模式（高品质），高表现模式，生成视频质量更佳，输出视频分辨率为1080P。<br>- `4k`：4K模式，高表现（同pro），生成视频质量更佳，输出视频分辨率为4K。<br>不同模型版本、视频模式支持范围不同，详见 能力地图 |
| `aspect_ratio` | string | 否 |  | 生成视频的画面纵横比（宽:高）<br>可选值: `16:9`, `9:16`, `1:1`<br>- 未使用首帧参考或视频编辑功能时，当前参数必填。 |
| `duration` | string | 否 | 5 | 生成视频时长，单位s<br>可选值: `3`, `4`, `5`, `6`, `7`, `8`, `9`, `10`, `11`, `12`, `13`, `14`, `15`<br>- 使用视频编辑功能（"refer_type":"base"）时，输出结果与传入视频时长相同，此时当前参数无效；此时，按输入视频时长四舍五入取整计量计费<br>不同模型版本、视频模式支持范围不同，详见 能力地图 |
| `watermark_info` | object | 否 |  | 是否同时生成含水印的结果<br>- 通过enabled参数定义，具体格式如下：<br>- true 为生成，false 为不生成<br>- 暂不支持自定义水印 |
| `callback_url` | string | 否 |  | 本次任务结果回调通知地址，如果配置，服务端会在任务状态发生变更时主动通知。<br>- 具体通知的消息 schema 见 Callback 协议 |
| `external_task_id` | string | 否 |  | 自定义任务ID。<br>- 传入不会覆盖系统生成的任务ID，但支持通过该ID进行任务查询。<br>- 请注意，单用户下需要保证唯一性。 |
**参数格式说明**

**`multi_prompt`**

```json
"multi_prompt":[
  { "index": int, "prompt": "string", "duration": "5" },
  { "index": int, "prompt": "string", "duration": "5" }
]
```

**`image_list`**

```json
"image_list":[
  { "image_url": "image_url"},
  { "image_url": "image_url" }
]
```

**`element_list`**

```json
"element_list":[
  { "element_id": long },
  { "element_id": long }
]
```

**`video_list`**

```json
"video_list":[
  { "video_url": "video_url", "refer_type": "base", "keep_original_sound": "yes" }
]
```

**`watermark_info`**

```json
"watermark_info": { "enabled": boolean }
```


#### 请求示例

```curl
curl --request POST \
  --url https://platform.dataeyes.ai/kling/v1/videos/omni-video \
  --header 'Authorization: Bearer <token>' \
  --header 'Content-Type: application/json' \
  --data '{
  "model_name": "kling-video-o1",
  "prompt": "让<<<image_1>>>中的人物向镜头挥手",
  "image_list": [
    {
      "image_url": "https://p2-kling.klingai.com/kcdn/cdn-kcdn112452/kling-qa-test/multi-1.png"
    }
  ],
  "duration": "5",
  "mode": "pro",
  "aspect_ratio": "16:9",
  "callback_url": "",
  "external_task_id": ""
}'
```

#### 响应示例

```json
{
  "code": 0, // 错误码；具体定义见错误码
  "message": "string", // 错误信息
  "request_id": "string", // 请求ID，系统生成，用于跟踪请求、排查问题
  "data": {
    "task_id": "string", // 任务ID，系统生成
    "task_info": { //任务创建时的参数信息
      "external_task_id": "string" //客户自定义任务ID
    },
    "task_status": "string", // 任务状态，枚举值：submitted（已提交）、processing（处理中）、succeed（成功）、failed（失败）
    "created_at": 1722769557708, // 任务创建时间，Unix时间戳、单位ms
    "updated_at": 1722769557708 //任务更新时间，Unix时间戳、单位ms
  }
}
```

---

### 查询任务（单个）

```
GET https://platform.dataeyes.ai/kling/v1/videos/omni-video/{id}
```

通过 ID 查询单个任务的状态和结果。

#### 请求头

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|:---|:---|:---:|:---|:---|
| `Content-Type` | string | 是 | application/json | 数据交换格式 |
| `Authorization` | string | 是 |  | 鉴权信息，参考接口鉴权 |

#### 请求示例

```curl
curl --request GET \
  --url https://platform.dataeyes.ai/kling/v1/videos/omni-video/{task_id} \
  --header 'Authorization: Bearer <token>'
```

#### 响应示例

```json
{
  "code": 0, // 错误码；具体定义见错误码
  "message": "string", // 错误信息
  "request_id": "string", // 请求ID，系统生成，用于跟踪请求、排查问题
  "data": {
    "task_id": "string", // 任务ID，系统生成
    "task_status": "string", // 任务状态，枚举值：submitted（已提交）、processing（处理中）、succeed（成功）、failed（失败）
    "task_status_msg": "string", // 任务状态信息，当任务失败时展示失败原因（如触发平台的内容风控等）
    "watermark_info": {
      "enabled": boolean
    },
    "task_result": {
      "videos": [
        {
          "id": "string", // 生成的视频ID；全局唯一
          "url": "string", // 生成视频的URL，防盗链格式（请注意，为保障信息安全，生成的图片/视频会在30天后被清理，请及时转存）
          "watermark_url": "string", // 含水印视频下载URL，防盗链格式
          "duration": "string" //视频总时长，单位s
        }
      ]
    },
    "task_info": { //任务创建时的参数信息
      "external_task_id": "string" //客户自定义任务ID
    },
    "final_unit_deduction": "string", // 任务最终扣减积分数值
    "created_at": 1722769557708, // 任务创建时间，Unix时间戳、单位ms
    "updated_at": 1722769557708 //任务更新时间，Unix时间戳、单位ms
  }
}
```

---

### 查询任务（列表）

```
GET https://platform.dataeyes.ai/kling/v1/videos/omni-video
```

分页查询任务列表。

#### 请求头

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|:---|:---|:---:|:---|:---|
| `Content-Type` | string | 是 | application/json | 数据交换格式 |
| `Authorization` | string | 是 |  | 鉴权信息，参考接口鉴权 |

#### 请求示例

```curl
curl --request GET \
  --url 'https://platform.dataeyes.ai/kling/v1/videos/omni-video?pageNum=1&pageSize=30' \
  --header 'Authorization: Bearer <token>'
```

#### 响应示例

```json
{
  "code": 0, // 错误码；具体定义见错误码
  "message": "string", // 错误信息
  "request_id": "string", // 请求ID，系统生成，用于跟踪请求、排查问题
  "data": [
    {
      "task_id": "string", // 任务ID，系统生成
      "task_status": "string", // 任务状态，枚举值：submitted（已提交）、processing（处理中）、succeed（成功）、failed（失败）
      "task_status_msg": "string", // 任务状态信息，当任务失败时展示失败原因（如触发平台的内容风控等）
      "task_info": { //任务创建时的参数信息
        "external_task_id": "string" //任务ID，客户自定义生成，与task_id两种查询方式二选一
      },
      "task_result": {
        "videos": [
          {
            "id": "string", // 生成的视频ID；全局唯一
            "url": "string", // 生成视频的URL，防盗链格式（请注意，为保障信息安全，生成的图片/视频会在30天后被清理，请及时转存）
            "watermark_url": "string", // 含水印视频下载URL，防盗链格式
            "duration": "string" //视频总时长，单位s
          }
        ]
      },
      "watermark_info": {
        "enabled": boolean
      },
      "final_unit_deduction": "string", // 任务最终扣减积分数值
      "created_at": 1722769557708, // 任务创建时间，Unix时间戳、单位ms
      "updated_at": 1722769557708 //任务更新时间，Unix时间戳、单位ms
    }
  ]
}
```
