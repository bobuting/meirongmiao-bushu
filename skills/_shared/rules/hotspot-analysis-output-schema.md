## 热点深度分析报告 JSON 输出格式

热点深度分析类 Skill 必须输出此标准 JSON 结构。

**只输出纯 JSON，不输出任何其他内容。**

### 顶层结构

```json
{
  "batch_analysis": { ... },
  "emotion_summary": { ... },
  "theme_summary": { ... },
  "deduction_summary": { ... },
  "tags_keywords_summary": { ... },
  "prediction_summary": { ... },
  "creation_suggestions": { ... }
}
```

---

### batch_analysis 结构（批量热点概览）

| 字段 | 类型 | 说明 |
|------|------|------|
| `total_count` | number | 热点总数 |
| `emotion_distribution` | object | 情绪分布（按类型统计） |
| `issue_clustering` | array | 议题聚类列表 |
| `emotion_trend` | string | 情绪趋势判断 |
| `user_deep_demand` | string | 用户深层诉求 |

```json
"batch_analysis": {
  "total_count": 10,
  "emotion_distribution": {
    "anxiety": { "count": 4, "percentage": 40, "hotspots": ["热点1", "热点4", "热点8", "热点10"] },
    "healing": { "count": 4, "percentage": 40, "hotspots": ["热点2", "热点5", "热点7", "热点9"] },
    "resonance": { "count": 2, "percentage": 20, "hotspots": ["热点3", "热点6"] }
  },
  "issue_clustering": [
    {
      "issue": "职场安全感",
      "related_hotspots": ["热点1", "热点4", "热点8"],
      "heat": "high",
      "deep_demand": "在不确定的时代找到确定感"
    },
    {
      "issue": "独处与治愈",
      "related_hotspots": ["热点2", "热点3", "热点9"],
      "heat": "medium",
      "deep_demand": "学会享受独处，与自己和解"
    }
  ],
  "emotion_trend": "焦虑蔓延，治愈需求强烈",
  "user_deep_demand": "被理解、获得力量、找到坚持的理由"
}
```

---

### emotion_summary 结构（情绪汇总）

| 字段 | 类型 | 说明 |
|------|------|------|
| `surface_emotion_distribution` | object | 表层情绪分布（百分比） |
| `high_frequency_emotion_words` | string[] | 高频情绪词 |
| `deep_emotion_focus` | array | 深层情绪聚焦点 |
| `emotion_contradictions` | array | 情绪矛盾分析 |
| `emotion_outlets` | string[] | 情绪出口列表 |

```json
"emotion_summary": {
  "surface_emotion_distribution": {
    "anxiety": 40,
    "healing": 40,
    "resonance": 20
  },
  "high_frequency_emotion_words": ["治愈", "焦虑", "温暖", "坚韧", "共鸣"],
  "deep_emotion_focus": [
    { "emotion": "不安全感", "hotspots": ["热点1", "热点4", "热点8"] },
    { "emotion": "自我满足", "hotspots": ["热点2", "热点9"] },
    { "emotion": "渴望认可", "hotspots": ["热点3", "热点6"] }
  ],
  "emotion_contradictions": [
    { "type": "想逃离vs不敢失去", "hotspots": ["热点1", "热点4"] },
    { "type": "孤独印象vs享受独处", "hotspots": ["热点2", "热点3"] }
  ],
  "emotion_outlets": ["被理解", "获得力量", "找到同类", "被安慰"]
}
```

---

### theme_summary 结构（主题汇总）

| 字段 | 类型 | 说明 |
|------|------|------|
| `core_issues` | array | 核心议题列表 |
| `core_pain_points` | array | 核心痛点列表 |
| `audience_profiles` | array | 受众画像分布 |
| `value_propositions` | array | 价值主张列表 |

```json
"theme_summary": {
  "core_issues": [
    { "issue": "职场安全感", "heat": "high", "hotspots": ["热点1", "热点4", "热点8"], "background": "经济下行，裁员潮背景" },
    { "issue": "独居文化", "heat": "high", "hotspots": ["热点2", "热点3", "热点9"], "background": "独居青年增多，自我相处能力受关注" }
  ],
  "core_pain_points": [
    { "pain_point": "想要掌控人生却身不由己", "hotspots": ["热点1", "热点4", "热点8"] },
    { "pain_point": "独居不是孤独，而是与自己对话", "hotspots": ["热点2", "热点3", "热点9"] }
  ],
  "audience_profiles": [
    { "type": "20-30岁独居女性", "percentage": 40, "hotspots": ["热点2", "热点3", "热点9"] },
    { "type": "25-35岁职场人", "percentage": 30, "hotspots": ["热点1", "热点4", "热点8"] }
  ],
  "value_propositions": [
    { "value": "学会享受独处是成年人的必修课", "hotspots": ["热点2", "热点3"] },
    { "value": "坚守不是认输，是另一种勇气", "hotspots": ["热点1", "热点4"] }
  ]
}
```

---

### deduction_summary 结构（推演汇总）

| 字段 | 类型 | 说明 |
|------|------|------|
| `scenes` | array | 推演场景列表 |
| `styles` | array | 推演风格列表 |
| `storylines` | array | 推演故事线列表 |
| `character_states` | array | 人物状态列表 |

```json
"deduction_summary": {
  "scenes": [
    { "scene": "阳光洒落的窗边角落", "emotion": "治愈/温暖", "hotspots": ["热点2", "热点3", "热点9"] },
    { "scene": "深夜办公室/地铁", "emotion": "焦虑/坚韧", "hotspots": ["热点1", "热点4", "热点8"] }
  ],
  "styles": [
    { "style": "温暖治愈+生活美学", "emotion": "治愈/自足", "visual": "暖色调、柔光", "hotspots": ["热点2", "热点3"] },
    { "style": "冷暖对比+写实", "emotion": "焦虑/坚韧", "visual": "冷色调+微暖光", "hotspots": ["热点1", "热点4"] }
  ],
  "storylines": [
    { "storyline": "日常→沉浸→满足", "emotion_arc": "平静→治愈→满足", "hotspots": ["热点2", "热点9"] },
    { "storyline": "困境→坚持→微光", "emotion_arc": "焦虑→坚韧→希望", "hotspots": ["热点1", "热点4"] }
  ],
  "character_states": [
    { "state": "慵懒自在、内心柔软", "emotion": "治愈/自足", "hotspots": ["热点2", "热点3"] },
    { "state": "疲惫但眼神坚定", "emotion": "焦虑/坚韧", "hotspots": ["热点1", "热点4"] }
  ]
}
```

---

### tags_keywords_summary 结构（标签与关键词汇总）

| 字段 | 类型 | 说明 |
|------|------|------|
| `emotion_tags` | string[] | 情绪标签 |
| `theme_tags` | string[] | 主题标签 |
| `scene_tags` | string[] | 场景标签 |
| `style_tags` | string[] | 风格标签 |
| `audience_tags` | string[] | 受众标签 |
| `core_keywords` | string[] | 核心关键词（10个） |
| `emotion_keywords` | string[] | 情绪关键词（10个） |
| `visual_keywords` | string[] | 视觉关键词（10个） |

```json
"tags_keywords_summary": {
  "emotion_tags": ["#治愈", "#温暖", "#焦虑", "#坚韧", "#共鸣"],
  "theme_tags": ["#独居生活", "#职场安全", "#自我成长", "#生活仪式感"],
  "scene_tags": ["#居家日常", "#办公室", "#窗边时光", "#深夜"],
  "style_tags": ["#日系清新", "#温暖治愈", "#写实风格", "#冷暖对比"],
  "audience_tags": ["#独居女生", "#职场人", "#20代女性", "#30代"],
  "core_keywords": ["独居", "治愈", "职场", "焦虑", "阳光", "窗边", "坚持", "温暖", "生活", "成长"],
  "emotion_keywords": ["温暖", "满足", "坚韧", "不安", "平静", "治愈", "倔强", "共鸣", "希望", "释然"],
  "visual_keywords": ["暖光", "柔和", "冷光", "微暖", "生活感", "写实", "清新", "窗边", "阳光", "深夜"]
}
```

---

### prediction_summary 结构（题材预测）

| 字段 | 类型 | 说明 |
|------|------|------|
| `script_types` | array | 适合脚本类型排序 |
| `spread_potential` | object | 传播潜力评估 |
| `viral_possibility` | object | 爆款可能性评估 |

```json
"prediction_summary": {
  "script_types": [
    { "type": "氛围感/OOTD", "hotspot_count": 5, "suitability": "高", "hotspots": ["热点2", "热点3", "热点5", "热点7", "热点9"] },
    { "type": "日常Vlog", "hotspot_count": 4, "suitability": "高", "hotspots": ["热点2", "热点3", "热点7", "热点9"] },
    { "type": "剧情/短剧", "hotspot_count": 3, "suitability": "中", "hotspots": ["热点1", "热点4", "热点8"] }
  ],
  "spread_potential": {
    "高": { "count": 5, "hotspots": ["热点2", "热点3", "热点5", "热点7", "热点9"] },
    "中": { "count": 3, "hotspots": ["热点1", "热点4", "热点8"] },
    "低": { "count": 2, "hotspots": ["热点6", "热点10"] }
  },
  "viral_possibility": {
    "高": { "count": 3, "hotspots": ["热点2", "热点5", "热点7"] },
    "中高": { "count": 4, "hotspots": ["热点3", "热点6", "热点8", "热点9"] },
    "中": { "count": 3, "hotspots": ["热点1", "热点4", "热点10"] }
  }
}
```

---

### creation_suggestions 结构（创作建议）

| 字段 | 类型 | 说明 |
|------|------|------|
| `recommended_script_type` | string | 推荐脚本类型 |
| `recommended_hook_type` | string | 推荐钩子类型 |
| `key_points` | string[] | 创作要点 |
| `cautions` | string[] | 注意事项 |

```json
"creation_suggestions": {
  "recommended_script_type": "氛围感/OOTD 或 日常Vlog",
  "recommended_hook_type": "视觉冲击型（治愈类）/ 情绪冲击型（焦虑类）",
  "key_points": [
    "治愈类热点：情绪要治愈而非孤独，传递正向生活态度",
    "焦虑类热点：需要情绪转化，从焦虑到坚韧到希望",
    "注意受众匹配，确保价值观正向"
  ],
  "cautions": [
    "热点10情绪负面，需谨慎处理或转化",
    "焦虑类热点避免贩卖焦虑，需提供出口"
  ]
}
```

---

### 重要规则

1. **所有字段必须存在**：不要省略字段，可以为空数组或空字符串
2. **数值类型不加引号**：total_count、count、percentage 等使用数字类型
3. **热点引用统一格式**：使用"热点N"格式引用，N为序号
4. **heat 字段值限定**：只能是 "high"、"medium"、"low"
5. **suitability 字段值限定**：只能是 "高"、"中"、"低"