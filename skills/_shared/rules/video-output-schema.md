## 视频脚本 JSON 输出格式（统一标准）

所有脚本生成类 Skill 必须输出此标准 JSON 结构。

**只输出纯 JSON，不输出任何其他内容。**

---

## ⚠️ 必需字段（不可省略）

以下字段必须输出，不可为 null、不可省略：

**video_info 必需字段（6个）**：`title`、`duration_seconds`、`source`、`time_of_day`、`weather`、`main_scene`

**video_analysis 必需字段（6个）**：`title`、`theme`、`summary`、`emotion`、`emotion.primary`、`atmosphere`

**shot_breakdown 每个镜头必需字段（8个）**：`shot_id`、`shot_type`、`camera_movement`、`shot_description`、`subjects`、`visual`、`audio`、`timecode`

**editing_analysis 必需字段（3个）**：`total_shots`、`editing_rhythm`、`pacing`

---

### 顶层结构

```json
{
  "video_info": { ... },
  "video_analysis": { ... },
  "shot_breakdown": [ ... ],
  "editing_analysis": { ... },
  "emotion_archetype": { ... }
}
```

> `emotion_archetype` 为可选顶层字段，反推分析类 Skill 必须输出，生成类 Skill 可省略。

### video_info 结构

| 字段 | 类型 | 说明 |
|------|------|------|
| `title` | string | 脚本标题，8-15字，概括故事核心 |
| `title_candidates` | string[] | 备选标题数组，必须输出 3 个最优标题，用于 Step5 交付发布展示 |
| `duration_seconds` | number | 总时长（秒），15-30秒范围内 |
| `source` | string | 来源说明（如"热点改编"、"原创"、"用户需求"） |
| `time_of_day` | string | 时间段：早晨/上午/中午/下午/傍晚/夜晚/深夜 |
| `weather` | string | 天气：晴天/阴天/雨天/雪天/雾天/多云 |
| `main_scene` | string | 脚本主场景，2-8字概括整个脚本的主要场景（如"老胡同"、"湖边草坪"、"独立咖啡馆"） |

```json
"video_info": {
  "title": "吸引人的脚本标题",
  "title_candidates": ["晨光里的邂逅", "胡同里的温暖时光", "老街咖啡香气"],
  "duration_seconds": 20,
  "source": "热点改编",
  "time_of_day": "早晨",
  "weather": "晴天",
  "main_scene": "老胡同"
}
```

### video_analysis 结构

| 字段 | 类型 | 说明 |
|------|------|------|
| `title` | string | 脚本主题标题 |
| `theme` | string | 一句话概括故事核心，不超过20字 |
| `summary` | string | 完整叙事摘要，100-200字，描述起因→发展→转折→收束 |
| `emotion` | object | 情绪信息 |

### atmosphere 氛围场景（重要：必须从统一字典选择）

**必须严格从以下 16 种氛围场景中选择，不得使用其他词汇：**

#### 自然氛围类
- 清晨清新、午后温暖、傍晚浪漫、夜晚静谧

#### 城市氛围类
- 城市喧嚣、胡同静谧、咖啡馆温馨、书店宁静

#### 情感氛围类
- 居家治愈、旅行自由、重逢温暖、独处内省

#### 特殊氛围类
- 雨中忧郁、风中清新、雪中纯净、落日壮美

**共计 16 种氛围场景，输出字符串格式，不得使用列表之外的词汇。**

| `emotion.primary` | EmotionToneCategory | 主要情绪，从以下 18 种统一字典中选择：欢快、阳光、动感、浪漫、轻松、空灵、抒情、宁静、古风、悲壮、忧郁、怀旧、迷茫、期待、满足、惊喜、自信、温暖 |

### emotion.primary 主要情绪（重要：必须从统一字典选择）

**必须严格从以下 18 种情绪基调中选择，不得使用其他词汇：**

#### 音乐已有 10 种（直接对应）
- 欢快、阳光、动感、浪漫、轻松、空灵、抒情、宁静、古风、悲壮

#### 扩充情绪 8 种（打破"全是治愈"）
- 忧郁、怀旧、迷茫、期待、满足、惊喜、自信、温暖

**共计 18 种情绪基调，输出字符串格式，不得使用列表之外的词汇。**

| `emotion.secondary` | EmotionToneCategory[] | 次要情绪列表（从统一字典选择） |
| `emotion.emotion_arc` | string | 情绪变化曲线，用箭头连接 |
| `video_type` | string | 视频类型 |
| `video_style` | string | 视觉风格 |
| `target_audience` | string | 目标受众画像 |
| `key_elements` | string[] | 关键元素列表 |
| `on_screen_presence` | object | 人物出镜信息（见下方人体模特判定规则） |
| `fashion_placement` | object | 服饰植入信息 |
| `atmosphere` | AtmosphereSceneCategory | 整体氛围，从以下 16 种统一字典中选择：清晨清新、午后温暖、傍晚浪漫、夜晚静谧、城市喧嚣、胡同静谧、咖啡馆温馨、书店宁静、居家治愈、旅行自由、重逢温暖、独处内省、雨中忧郁、风中清新、雪中纯净、落日壮美 |

### on_screen_presence 人体模特判定规则（重要）

**区分真人模特和人体模特**：

| 类型 | 特征 | `has_real_person` | `subjects[].type` |
|------|------|-------------------|-------------------|
| **真人模特** | 有表情、有动作、有视线方向、有情绪互动、活体人物 | `true` | `"人物"` |
| **人体模特/假人** | 无表情、机械旋转/静止、无视线、展示道具、固定在底座上 | `false` | `"物体"` |
| **模特假人** | 塑料/树脂材质、关节可动但无自主表情、展示用途 | `false` | `"物体"` |

**判断依据**：
- 人物有**表情变化**（微笑、皱眉、眼神互动）→ 真人 → `has_real_person = true`
- 人物**固定在底座/展示台上** → 人体模特 → `has_real_person = false`
- 人物动作是**机械旋转展示**（如360度旋转）→ 人体模特 → `has_real_person = false`
- 人物**无表情、无眼神变化**，动作只有展示服装功能 → 人体模特 → `has_real_person = false`
- description 提到"人体模特"、"假人"、"展示道具"、"模特架" → `has_real_person = false`

**错误示例**：
```json
// ❌ 错误：人体模特被错误标记为真人
{
  "has_real_person": true,
  "person_details": [{"description": "男性人体模特，金发，身材高挑"}]
}

// ✅ 正确：人体模特应标记为无真人出镜
{
  "has_real_person": false,
  "person_count": 0,
  "person_details": [],
  "exposure_level": "高",
  "exposure_description": "服饰全程露出，通过人体模特展示"
}
```

```json
"video_analysis": {
  "title": "脚本主题",
  "theme": "孤独中的偶然连接",
  "summary": "100-200字完整叙事摘要。必须描述：起因（触发点）→发展（行动与发现）→转折（出人意料的点）→收束（留白或回味）。",
  "emotion": {
    "primary": "温暖",
    "secondary": ["好奇", "释怀"],
    "emotion_arc": "孤独→好奇→温暖→释怀"
  },
  "video_type": "情绪故事",
  "video_style": "日系清新",
  "target_audience": "25-35岁都市独居人群",
  "key_elements": ["反复出现的视觉元素"],
  "on_screen_presence": {
    "has_real_person": true,
    "person_count": 1,
    "person_details": [{
      "person_id": 1,
      "description": "角色的外观和气质描述",
      "age": 25,
      "gender": "male/female",
      "screen_time_ratio": 1.0,
      "appearance_notes": "出镜说明"
    }],
    "exposure_level": "高/中/低",
    "exposure_description": "服饰露出程度描述"
  },
  "fashion_placement": {
    "suitable": true,
    "reason": "服饰如何自然融入故事",
    "recommended_styles": [
      {
        "style": "服饰风格名称",
        "fit_score": 0.9,
        "reason": "推荐理由",
        "recommended_items": ["单品1", "单品2", "单品3"]
      }
    ],
    "placement_notes": "服饰在故事中的角色说明"
  },
  "atmosphere": "居家治愈"
}
```

### shot_breakdown 数组结构

每个镜头包含以下字段：

| 字段 | 类型 | 说明 |
|------|------|------|
| `shot_id` | number | 镜头编号，从1开始递增 |
| `timecode` | object | 时间码信息 |
| `timecode.start` | string | 开始时间，格式 00:00:00 |
| `timecode.end` | string | 结束时间，格式 00:00:00 |
| `timecode.duration_seconds` | number | 该镜头时长（秒），4-8秒范围内（必须 ≥ 4秒，低于4秒视为无效输出，需要合并相邻镜头） |
| `shot_type` | string | 景别：大特写/特写/近景/中景/中全景/全景/远景/大远景 |
| `camera_movement` | string | 运镜：固定镜头/推镜头/拉镜头/摇镜头/移镜头/跟随镜头 |
| `transition_in` | object | 入场转场，含 type（转场类型）、duration_seconds（时长）、color（转场颜色，可选，如"黑/白"） |
| `transition_out` | object | 出场转场，含 type（转场类型）、duration_seconds（时长）、color（转场颜色，可选，如"黑/白"） |
| `camera_details` | object | 摄影参数（可选，反推分析类输出） |
| `visual` | object | 视觉信息 |
| `subjects` | array | 主体数组 |
| `text_elements` | array | 文字元素（可选，反推分析类输出） |
| `speed_effects` | object | 变速与特效（可选，反推分析类输出） |
| `audio` | object | 音频信息（场景自然声音、台词、音乐等） |
| `shot_description` | string | 镜头整体描述，30-60字 |

### camera_details 结构（可选）

反推分析类 Skill 输出此字段，生成类 Skill 可省略或设为 null。

| 字段 | 类型 | 说明 |
|------|------|------|
| `focal_length` | string | 焦距估算，如 "35mm" |
| `focus` | object | 焦点信息 |
| `focus.subject` | string | 对焦主体 |
| `focus.depth_of_field` | string | 景深：浅/中/深 |
| `focus.bokeh_quality` | string | 焦外质量：柔滑/一般/硬边 |
| `focus_pull` | object | 焦点转移 |
| `focus_pull.has_pull` | boolean | 是否有焦点转移 |
| `focus_pull.from` | string\|null | 转移起点 |
| `focus_pull.to` | string\|null | 转移终点 |
| `focus_pull.timing` | string\|null | 发生时间 |
| `stabilization` | string | 稳定方式：三脚架/稳定器/肩扛/手持/斯坦尼康 |
| `camera_height` | string | 机位高度：鸟瞰/高俯/微俯/平视/微仰/仰拍/虫眼 |
| `camera_angle` | string | 拍摄角度：正面/斜侧45°/侧面/斜侧135°/背面 |
| `lens_effect` | object | 镜头特效 |
| `lens_effect.vignette` | string | 暗角：无/轻微/明显 |
| `lens_effect.flare` | string | 光晕：无/轻微/明显 |
| `lens_effect.distortion` | string | 畸变：无/轻微/明显 |
| `lens_effect.breathing` | string | 呼吸感：无/轻微/明显 |
| `lens_effect.leak` | string | 漏光：无/轻微/明显 |

```json
"camera_details": {
  "focal_length": "35mm",
  "focus": {
    "subject": "人物面部和书本",
    "depth_of_field": "中",
    "bokeh_quality": "柔滑"
  },
  "focus_pull": {
    "has_pull": false,
    "from": null,
    "to": null,
    "timing": null
  },
  "stabilization": "三脚架",
  "camera_height": "平视",
  "camera_angle": "斜侧45°",
  "lens_effect": {
    "vignette": "轻微",
    "flare": "无",
    "distortion": "无",
    "breathing": "无",
    "leak": "无"
  }
}
```

### visual 完整结构

visual 内包含 scene、composition（可选）、lighting、color 四个子结构。

#### visual.scene 结构

| 字段 | 类型 | 说明 |
|------|------|------|
| `location_type` | string | 室内/室外 |
| `specific_location` | string | 具体位置 |
| `environment` | string | 环境描述 |
| `set_dressing` | string | 场景布置细节（可选，反推分析类输出） |

#### visual.composition 结构（可选）

反推分析类 Skill 输出此字段，生成类 Skill 可省略或设为 null。

| 字段 | 类型 | 说明 |
|------|------|------|
| `framing_rule` | string | 构图法则：三分法/居中/对称/引导线/框架构图/对角线/黄金螺旋/留白 |
| `subject_position` | string | 主体位置 |
| `subject_scale` | string | 主体面积占比（约1/4、1/3、1/2、2/3） |
| `facing_direction` | string | 人物朝向（画面视觉方向，与 body_angle 不同） |
| `headroom` | string | 头空间：充裕/适中/裁切 |
| `lead_room` | string | 引导空间 |
| `depth` | string | 景深层次描述 |
| `background` | string | 背景元素 |
| `frame_within_frame` | string\|null | 框架内框架 |

#### visual.lighting 结构

| 字段 | 类型 | 说明 |
|------|------|------|
| `type` | string | 光源类型（自然光/人工光/混合） |
| `direction` | string | 光线方向（正面/侧面/逆光/顶光/底光） |
| `color_temperature` | string | 色温估算（可选，如 "3200K"） |
| `mood` | string | 光线氛围 |
| `shadow` | string | 阴影类型：硬阴影/柔阴影/无阴影（可选） |

#### visual.color 结构

| 字段 | 类型 | 说明 |
|------|------|------|
| `dominant_colors` | string[] | 主色调名称列表 |
| `dominant_color_hex` | string[] | 主色调十六进制色值列表（可选，与 dominant_colors 一一对应） |
| `color_mood` | string | 色彩情绪 |
| `color_grade` | string | 调色风格 |
| `contrast` | string | 对比度：高/中/低（可选） |
| `saturation` | string | 饱和度：高/中/低/去饱和（可选） |
| `grain` | string | 胶片颗粒感：无/轻微/明显/重度（可选） |

```json
"visual": {
  "scene": {
    "location_type": "室内",
    "specific_location": "咖啡馆角落",
    "environment": "温暖灯光，木质桌椅，窗外光线透入",
    "set_dressing": "窗台上一盆绿萝，旁边散落两本精装书"
  },
  "composition": {
    "framing_rule": "三分法",
    "subject_position": "画面右侧三分线",
    "subject_scale": "约1/2",
    "facing_direction": "朝左",
    "headroom": "适中",
    "lead_room": "左侧留白约1/3画面",
    "depth": "前景虚化，中景人物清晰，背景虚化",
    "background": "米白色墙面、绿植、木质家具",
    "frame_within_frame": "窗框自然形成二次构图"
  },
  "lighting": {
    "type": "自然光",
    "direction": "侧面",
    "color_temperature": "暖色调（约3500K）",
    "mood": "温暖柔和",
    "shadow": "柔阴影"
  },
  "color": {
    "dominant_colors": ["米色", "棕色"],
    "dominant_color_hex": ["#D4C5A9", "#8B9E6B"],
    "color_mood": "温馨",
    "color_grade": "暖色调",
    "contrast": "低",
    "saturation": "中",
    "grain": "轻微"
  }
}
```

### subjects 数组元素结构

**严格规则（系统会校验，不符合会报错）**：

#### 三种情况

1. **空镜（没有主体）**：`subjects: []`（空数组）
2. **人物镜头**：`subjects: [{ type: "人物", ... }]`（严格约束，见下表）
3. **物品镜头**：`subjects: [{ type: "物体", ... }]`（严格约束，不含人物专属字段）

**`type` 字段只允许两个值："人物" 或 "物体"，不允许使用其他值（如 "person"、"clothing" 等）。**

#### 人物主体（type: "人物"）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `type` | `"人物"` | ✅ | 固定为 "人物" |
| `person_id` | number | ✅ | 人物 ID（正整数） |
| `eye_line` | string | ✅ | 视线方向（必须是字符串，不能为 null） |
| `clothing` | object | ✅ | 服饰信息（含 ref 字段，见下方 clothing 结构） |
| `subject_id` | number | 可选 | 主体编号 |
| `description` | string | 可选 | 主体描述 |
| `position` | string | 可选 | 画面位置 |
| `body_angle` | string | 可选 | 身体朝向 |
| `action` | string | 可选 | 动作描述 |
| `movement` | string | 可选 | 运动方式：静止/走动/转身/坐下/站起/奔跑等 |
| `movement_speed` | string | 可选 | 运动速度：快/中/慢/无 |
| `expression` | string | 可选 | 表情 |
| `props` | array | 可选 | 道具数组 |

**人物主体示例**：
```json
{
  "type": "人物",
  "person_id": 1,
  "eye_line": "看向窗外",
  "clothing": {
    "ref": "搭配1",
    "overall_style": "休闲家居风"
  },
  "description": "年轻女性站在窗边",
  "action": "轻抚头发",
  "expression": "微笑"
}
```

#### 物品主体（type: "物体"）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `type` | `"物体"` | ✅ | 固定为 "物体" |
| `eye_line` | string\|null | 可选 | 物体没有视线，可为 null |
| `subject_id` | number | 可选 | 主体编号 |
| `description` | string | 可选 | 物品描述 |
| `position` | string | 可选 | 画面位置 |
| `body_angle` | string | 可选 | 物品角度 |
| `action` | string | 可选 | 动作描述 |
| `movement` | string | 可选 | 运动方式 |
| `movement_speed` | string | 可选 | 运动速度 |
| `props` | array | 可选 | 道具数组 |

**物品主体不包含以下字段**：`person_id`、`clothing`、`expression`。出现这些字段会导致校验失败。

**物品主体示例**：
```json
{
  "type": "物体",
  "description": "白色衬衫平铺展示",
  "position": "画面中央",
  "eye_line": null
}
```

### clothing 结构

服饰的视觉外观由参考图（五视图+平铺图）保证，clothing 字段仅用于**锚点标识和整体风格描述**，不需要详细描写服饰的颜色、材质、款式。

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `ref` | string \| null | 可选 | 服饰锚点标识。**用户角色（person_id=1）必填**，对应参考图中的搭配（如"搭配1"）；**配角可选**，由 AI 智能生成 |
| `overall_style` | string | 可选 | 整体风格概述（如"休闲家居风"、"通勤简约风"） |

**注意**：`top`、`bottom`、`accessories`、`color_hex` 等详细字段**已废弃**，不再使用。服饰细节由参考图传递，文本描述冗余且可能冲突。

### text_elements 数组结构（可选）

反推分析类 Skill 输出此字段，生成类 Skill 可省略或设为空数组。

| 字段 | 类型 | 说明 |
|------|------|------|
| `type` | string | 字幕/标题/贴纸 |
| `content` | string | 文字内容 |
| `position` | string | 位置 |
| `style` | string | 样式 |
| `animation` | string | 入场动画：淡入/弹入/打字机/无 |

### speed_effects 结构（可选）

反推分析类 Skill 输出此字段，生成类 Skill 可省略或设为 null。

| 字段 | 类型 | 说明 |
|------|------|------|
| `playback_speed` | number | 播放速度倍率 |
| `speed_ramp` | object | 变速渐变 |
| `speed_ramp.has_ramp` | boolean | 是否有变速渐变 |
| `speed_ramp.description` | string\|null | 渐变描述 |
| `freeze_frame` | object | 定格帧 |
| `freeze_frame.has_freeze` | boolean | 是否有定格帧 |
| `freeze_frame.at_seconds` | number\|null | 定格时间点 |
| `overlay` | object | 叠加效果 |
| `overlay.film_grain` | boolean | 胶片颗粒 |
| `overlay.light_leak` | boolean | 漏光 |
| `overlay.dust_particles` | boolean | 灰尘粒子 |
| `overlay.color_filter` | string\|null | 色彩滤镜 |
| `overlay.other` | string\|null | 其他效果 |

```json
"speed_effects": {
  "playback_speed": 1.0,
  "speed_ramp": { "has_ramp": false, "description": null },
  "freeze_frame": { "has_freeze": false, "at_seconds": null },
  "overlay": { "film_grain": false, "light_leak": false, "dust_particles": false, "color_filter": null, "other": null }
}
```

### audio 结构

| 字段 | 类型 | 说明 |
|------|------|------|
| `ambient_sound` | string | 场景环境音描述（如"窗外鸟鸣、书页翻动声"） |
| `dialogue` | object\|null | 台词对象 `{ speaker?, content?, tone? }`（可选，反推分析类输出） |
| `narration` | object\|null | 旁白对象 `{ content?, text?, tone? }`（可选，反推分析类输出） |
| `sound_effects` | array\|null | 音效数组 `[{ type, description?, sync_point? }]`（可选，反推分析类输出） |

**注意**：分镜中不包含背景音乐（BGM），音乐由后期统一配乐，避免各镜头音乐风格冲突。

生成类 Skill 可只输出 `ambient_sound`，反推分析类 Skill 应尽可能填充全部字段。

```json
"audio": {
  "ambient_sound": "窗外鸟鸣、书页翻动声",
  "dialogue": null,
  "narration": {
    "content": "旁白内容",
    "tone": "平静"
  },
  "sound_effects": [
    {
      "type": "翻书声",
      "description": "轻柔的翻书声",
      "sync_point": "与画面同步"
    }
  ]
}
```

### shot_breakdown 完整示例

```json
"shot_breakdown": [
  {
    "shot_id": 1,
    "timecode": {
      "start": "00:00:00",
      "end": "00:00:04",
      "duration_seconds": 4.0
    },
    "shot_type": "中景",
    "camera_movement": "固定镜头",
    "transition_in": {
      "type": "硬切",
      "duration_seconds": 0
    },
    "transition_out": {
      "type": "硬切",
      "duration_seconds": 0
    },
    "camera_details": {
      "focal_length": "35mm",
      "focus": { "subject": "人物面部", "depth_of_field": "中", "bokeh_quality": "柔滑" },
      "focus_pull": { "has_pull": false, "from": null, "to": null, "timing": null },
      "stabilization": "三脚架",
      "camera_height": "平视",
      "camera_angle": "斜侧45°",
      "lens_effect": { "vignette": "无", "flare": "无", "distortion": "无", "breathing": "无", "leak": "无" }
    },
    "visual": {
      "scene": {
        "location_type": "室内",
        "specific_location": "咖啡馆角落",
        "environment": "温暖灯光，木质桌椅，窗外光线透入",
        "set_dressing": "桌上散落精装书，旁边一盆绿萝"
      },
      "composition": {
        "framing_rule": "三分法",
        "subject_position": "画面中央偏左",
        "subject_scale": "约1/3",
        "facing_direction": "朝右",
        "headroom": "适中",
        "lead_room": "右侧留白",
        "depth": "前景虚化边缘，中景清晰，背景虚化",
        "background": "木质书架、暖色台灯",
        "frame_within_frame": null
      },
      "lighting": {
        "type": "自然光+室内灯光",
        "direction": "侧面",
        "color_temperature": "约4000K",
        "mood": "温暖柔和",
        "shadow": "柔阴影"
      },
      "color": {
        "dominant_colors": ["米色", "棕色"],
        "dominant_color_hex": ["#D4C5A9", "#8B9E6B"],
        "color_mood": "温馨",
        "color_grade": "暖色调",
        "contrast": "中",
        "saturation": "中",
        "grain": "无"
      }
    },
    "subjects": [{
      "subject_id": 1,
      "type": "人物",
      "person_id": 1,
      "description": "年轻人，气质沉静",
      "position": "画面中央偏左",
      "body_angle": "四分之三侧",
      "eye_line": "看向手中的书本",
      "action": "低头翻书",
      "movement": "静止",
      "movement_speed": "无",
      "expression": "专注平静",
      "clothing": {
        "ref": "搭配1",
        "overall_style": "简约舒适"
      },
      "props": ["书本"]
    }],
    "text_elements": [],
    "speed_effects": {
      "playback_speed": 1.0,
      "speed_ramp": { "has_ramp": false, "description": null },
      "freeze_frame": { "has_freeze": false, "at_seconds": null },
      "overlay": { "film_grain": false, "light_leak": false, "dust_particles": false, "color_filter": null, "other": null }
    },
    "audio": {
      "ambient_sound": "咖啡馆轻声交谈、咖啡机运转声、杯子碰撞声"
    },
    "shot_description": "坐在咖啡馆角落，低头翻书，神情专注平静"
  }
]
```

### editing_analysis 结构

| 字段 | 类型 | 说明 |
|------|------|------|
| `total_shots` | number | 镜头总数 |
| `average_shot_duration` | number | 平均镜头时长（秒） |
| `longest_shot_seconds` | number | 最长镜头秒数 |
| `shortest_shot_seconds` | number | 最短镜头秒数 |
| `editing_rhythm` | string | 剪辑节奏描述 |
| `pacing` | string | 整体节奏：快/中/慢 |
| `cut_style` | string | 剪辑风格 |

```json
"editing_analysis": {
  "total_shots": 5,
  "average_shot_duration": 4.0,
  "longest_shot_seconds": 5,
  "shortest_shot_seconds": 3,
  "editing_rhythm": "平稳推进，情绪渐进",
  "pacing": "中",
  "cut_style": "连贯叙事"
}
```

### emotion_archetype 结构（可选）

反推分析类 Skill 必须输出此字段，生成类 Skill 可省略。用于提取可复用的情感原型。

| 字段 | 类型 | 说明 |
|------|------|------|
| `category` | string | 8 大类别之一：自我发现/时间流逝/人际连接/意外时刻/日常仪式/蜕变逆袭/身份切换/仪式庆典 |
| `emotion_core` | string | 情感核心转变（如：不确定 → 接纳） |
| `moment` | string | 视频中具体的情感瞬间描述（通用场景，可迁移） |
| `conflict` | string | 核心矛盾或张力 |
| `clothing_role` | string | 服饰在情感表达中扮演的角色 |

**提取原则**：
- 必须识别出一个清晰的**情感转变弧线**（如：犹豫→释怀、紧张→自信）
- `moment` 描述的是一个**通用场景**，而非视频独有的情节（可迁移到其他视频）
- `clothing_role` 说明服饰如何服务于这个情感转变（如：服饰=新身份的象征）
- 如果视频纯搞笑/无明确情感转变/不适合服饰植入，则 `emotion_archetype` 输出 null

**8大类别参考**：
1. **自我发现**：镜子前的陌生人、断舍离、第一次穿出门
2. **时间流逝**：季节更替穿搭、从学生到职场
3. **人际连接**：约会穿搭、闺蜜逛街、情侣默契
4. **意外时刻**：突然被拍、雨天偶遇、意外礼物
5. **日常仪式**：晨间穿搭仪式、周末brunch、下班换装
6. **蜕变逆袭**：素人改造、风格突破、自信蜕变
7. **身份切换**：上班vs约会、工作日vs周末、白天vs夜晚
8. **仪式庆典**：毕业穿搭、新年新衣、生日惊喜

```json
"emotion_archetype": {
  "category": "自我发现",
  "emotion_core": "紧张 → 自信",
  "moment": "穿上慵懒风新衣，在窗边阳光中第一次感到'这就是我'",
  "conflict": "独居的孤独感与自我接纳之间的微妙平衡",
  "clothing_role": "服饰=舒适的自我保护壳，休闲风格=对真实自我的接纳"
}
```

### 重要规则

1. **所有字段必须存在**：不要省略字段，可以为 null
2. **null 字段保持 null**：原始为 null 的字段，输出也保持 null
3. **数值类型不加引号**：duration_seconds、shot_id 等使用数字类型
4. **时间码格式统一**：使用 00:00:00 格式
5. **每个镜头时长4-8秒**：不低于4秒，不超过8秒，超出范围需调整或拆分。**必须 ≥ 4秒**，低于4秒的镜头必须合并到相邻镜头
6. **总时长15-30秒**：不符合需调整
7. **相邻镜头情绪不同**：避免情绪重复
8. **标记为"可选"的字段**：生成类 Skill 可省略或设为 null，反推分析类 Skill 必须输出

---

## 完整示例：情感治愈风格

以下是一个完整的视频脚本 JSON 示例，包含所有字段（含可选字段）：

```json
{
  "video_info": {
    "title": "窗边静读时光",
    "duration_seconds": 8.0,
    "source": "用户上传",
    "time_of_day": "下午",
    "weather": "晴天",
    "main_scene": "家中窗边角落"
  },
  "video_analysis": {
    "title": "窗边静读时光",
    "theme": "独居生活的治愈瞬间",
    "summary": "一个人在阳光洒落的窗边安静看书，享受独居生活的惬意时光。",
    "emotion": {
      "primary": "温暖",
      "secondary": ["宁静", "满足"],
      "emotion_arc": "平静→沉浸→满足"
    },
    "video_type": "情感治愈",
    "video_style": "日系清新",
    "target_audience": "20-30岁，喜欢独居生活内容",
    "key_elements": ["阳光", "窗边", "书籍", "休闲穿搭"],
    "on_screen_presence": {
      "has_real_person": true,
      "person_count": 1,
      "person_details": [{
        "person_id": 1,
        "description": "约25岁，气质沉稳从容",
        "age": 25,
        "gender": "male",
        "screen_time_ratio": 1.0,
        "appearance_notes": "全程出镜"
      }],
      "exposure_level": "高",
      "exposure_description": "服饰全程露出"
    },
    "fashion_placement": {
      "suitable": true,
      "reason": "休闲家居风服饰自然融入独居场景",
      "recommended_styles": [
      {
        "style": "服饰风格名称",
        "fit_score": 0.9,
        "reason": "推荐理由",
        "recommended_items": ["单品1", "单品2", "单品3"]
      }
    ],
      "placement_notes": "服饰作为角色造型，不刻意展示"
    },
    "atmosphere": "居家治愈"
  },
  "shot_breakdown": [
    {
      "shot_id": 1,
      "timecode": {
        "start": "00:00:00",
        "end": "00:00:04",
        "duration_seconds": 4.0
      },
      "shot_type": "中景",
      "camera_movement": "固定镜头",
      "transition_in": {
        "type": "淡入",
        "duration_seconds": 0.5
      },
      "transition_out": {
        "type": "硬切",
        "duration_seconds": 0
      },
      "camera_details": {
        "focal_length": "35mm",
        "focus": { "subject": "人物面部和书本", "depth_of_field": "中", "bokeh_quality": "柔滑" },
        "focus_pull": { "has_pull": false, "from": null, "to": null, "timing": null },
        "stabilization": "三脚架",
        "camera_height": "平视",
        "camera_angle": "斜侧45°",
        "lens_effect": { "vignette": "轻微", "flare": "无", "distortion": "无", "breathing": "无", "leak": "无" }
      },
      "visual": {
        "scene": {
          "location_type": "室内",
          "specific_location": "家中窗边角落",
          "environment": "阳光透过白色纱帘洒入，窗边有绿植和软垫",
          "set_dressing": "窗台上一盆绿萝，旁边散落两本精装书，软垫是亚麻材质米白色"
        },
        "composition": {
          "framing_rule": "三分法",
          "subject_position": "画面右侧三分线",
          "subject_scale": "约1/2",
          "facing_direction": "朝左",
          "headroom": "适中",
          "lead_room": "左侧留白约1/3画面",
          "depth": "前景窗框虚化边缘，中景人物清晰，背景虚化",
          "background": "米白色墙面、绿植、木质家具",
          "frame_within_frame": "窗框自然形成二次构图"
        },
        "lighting": {
          "type": "自然光",
          "direction": "左侧逆光",
          "color_temperature": "暖色调（约3500K）",
          "mood": "柔和温暖，有圆形光斑",
          "shadow": "柔阴影"
        },
        "color": {
          "dominant_colors": ["米白色", "浅棕色", "淡绿色"],
          "dominant_color_hex": ["#F5F0E8", "#D4C5A9", "#A8C5A0"],
          "color_mood": "温暖治愈",
          "color_grade": "日系胶片感，低对比度",
          "contrast": "低",
          "saturation": "中",
          "grain": "轻微"
        }
      },
      "subjects": [{
        "subject_id": 1,
        "type": "人物",
        "person_id": 1,
        "description": "约25岁，气质沉稳从容",
        "position": "坐在窗边软垫上",
        "body_angle": "四分之三侧面",
        "eye_line": "看向手中的书本",
        "action": "专注看书，偶尔翻页",
        "movement": "静止",
        "movement_speed": "无",
        "expression": "平静专注，嘴角微微上扬",
        "clothing": {
          "ref": "搭配1",
          "overall_style": "休闲家居风"
        },
        "props": ["书本"]
      }],
      "text_elements": [],
      "speed_effects": {
        "playback_speed": 1.0,
        "speed_ramp": { "has_ramp": false, "description": null },
        "freeze_frame": { "has_freeze": false, "at_seconds": null },
        "overlay": { "film_grain": true, "light_leak": false, "dust_particles": false, "color_filter": null, "other": null }
      },
      "audio": {
        "ambient_sound": "窗外鸟鸣、书页翻动声、远处街道轻微人声"
      },
      "shot_description": "坐在洒满阳光的窗边，专注地看书"
    },
    {
      "shot_id": 2,
      "timecode": {
        "start": "00:00:04",
        "end": "00:00:08",
        "duration_seconds": 4.0
      },
      "shot_type": "近景",
      "camera_movement": "固定镜头",
      "transition_in": {
        "type": "硬切",
        "duration_seconds": 0
      },
      "transition_out": {
        "type": "淡出",
        "duration_seconds": 0.5
      },
      "camera_details": {
        "focal_length": "50mm",
        "focus": { "subject": "人物面部", "depth_of_field": "浅", "bokeh_quality": "柔滑" },
        "focus_pull": { "has_pull": false, "from": null, "to": null, "timing": null },
        "stabilization": "三脚架",
        "camera_height": "平视",
        "camera_angle": "斜侧45°",
        "lens_effect": { "vignette": "无", "flare": "无", "distortion": "无", "breathing": "无", "leak": "无" }
      },
      "visual": {
        "scene": {
          "location_type": "室内",
          "specific_location": "家中窗边角落",
          "environment": "阳光透过白色纱帘洒入",
          "set_dressing": null
        },
        "composition": {
          "framing_rule": "居中",
          "subject_position": "画面中央",
          "subject_scale": "约2/3",
          "facing_direction": "正面偏右",
          "headroom": "适中",
          "lead_room": null,
          "depth": "浅景深，背景虚化",
          "background": "虚化的窗边绿植",
          "frame_within_frame": null
        },
        "lighting": {
          "type": "自然光",
          "direction": "左侧逆光",
          "color_temperature": "暖色调（约3500K）",
          "mood": "柔和温暖",
          "shadow": "柔阴影"
        },
        "color": {
          "dominant_colors": ["米白色", "浅棕色"],
          "dominant_color_hex": ["#F5F0E8", "#D4C5A9"],
          "color_mood": "温暖治愈",
          "color_grade": "日系胶片感",
          "contrast": "低",
          "saturation": "中",
          "grain": "轻微"
        }
      },
      "subjects": [{
        "subject_id": 1,
        "type": "人物",
        "person_id": 1,
        "description": "约25岁，气质沉稳从容",
        "position": "坐在窗边软垫上",
        "body_angle": "四分之三侧面",
        "eye_line": "望向窗外",
        "action": "合上书本，望向窗外",
        "movement": "静止",
        "movement_speed": "无",
        "expression": "嘴角带着满足的微笑",
        "clothing": {
          "ref": "搭配1",
          "overall_style": "休闲家居风"
        },
        "props": ["书本"]
      }],
      "text_elements": [],
      "speed_effects": {
        "playback_speed": 1.0,
        "speed_ramp": { "has_ramp": false, "description": null },
        "freeze_frame": { "has_freeze": false, "at_seconds": null },
        "overlay": { "film_grain": true, "light_leak": false, "dust_particles": false, "color_filter": null, "other": null }
      },
      "audio": {
        "ambient_sound": "窗外鸟鸣、风声、远处街道轻微人声"
      },
      "shot_description": "合上书本，望向窗外的阳光，脸上带着满足的微笑"
    }
  ],
  "editing_analysis": {
    "total_shots": 2,
    "average_shot_duration": 4.0,
    "longest_shot_seconds": 4.0,
    "shortest_shot_seconds": 4.0,
    "editing_rhythm": "舒缓节奏，以情绪连贯为主",
    "pacing": "慢",
    "cut_style": "淡入淡出为主，柔和转场"
  },
  "emotion_archetype": {
    "category": "日常仪式",
    "emotion_core": "平静 → 满足",
    "moment": "独居午后，阳光照进窗边，安静看书直到心生满足",
    "conflict": "独处的孤独感与自我接纳之间的微妙平衡",
    "clothing_role": "服饰=舒适的自我保护壳，休闲风格=对真实自我的接纳"
  }
}
```
