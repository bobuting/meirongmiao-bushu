# styleWords 情绪基调修复方案

## 问题描述

项目在 Step1/Step2 报错：
```
rolePresets[0].styleWords[0] must be one of 18 emotion tone categories:
欢快、阳光、动感、浪漫、轻松、空灵、抒情、宁静、古风、悲壮、忧郁、怀旧、迷茫、期待、满足、惊喜、自信、温暖
```

**原因**：数据库中存储的 `styleWords` 使用了服装风格描述词（如"青春"、"活力"、"运动"），而非系统要求的 18 种情绪基调。

## 情绪基调字典（18 种）

| 基调 | 适用场景 |
|-----|---------|
| 欢快 | 高兴、愉悦 |
| 阳光 | 积极、向上、青春 |
| 动感 | 运动、活力、能量 |
| 浪漫 | 爱情、梦幻 |
| 轻松 | 休闲、放松、舒适 |
| 空灵 | 神秘、仙气 |
| 抒情 | 文艺、诗意 |
| 宁静 | 安静、简约、沉稳 |
| 古风 | 传统、古典 |
| 悲壮 | 沉重、史诗 |
| 忧郁 | 悲伤、忧郁 |
| 怀旧 | 复古、回忆 |
| 迷茫 | 不确定、困惑 |
| 期待 | 希望、未来 |
| 满足 | 完成感、充实 |
| 惊喜 | 意外、新鲜 |
| 自信 | 确定感、酷 |
| 温暖 | 温馨、柔和、甜美 |

## 映射规则

| 原词 | 映射到 | 说明 |
|-----|-------|------|
| 青春 | 阳光 | 青春活力 |
| 活力 | 动感 | 活力动感 |
| 运动 | 动感 | 运动感 |
| 休闲 | 轻松 | 休闲舒适 |
| 清新 | 轻松 | 清新自然 |
| 简约 | 宁静 | 简约沉稳 |
| 学院 | 阳光 | 学院青春 |
| 自然 | 轻松 | 自然舒适 |
| 街头 | 动感 | 街头活力 |
| 潮流 | 自信 | 潮流个性 |
| 个性 | 自信 | 个性鲜明 |
| 酷感 | 自信 | 酷感自信 |
| 甜美 | 温暖 | 甜美温馨 |
| 柔和 | 温暖 | 柔和温暖 |
| 可爱 | 温暖 | 可爱温馨 |
| 户外 | 动感 | 户外活力 |
| 实用 | 轻松 | 实用舒适 |
| 轻盈 | 轻松 | 轻盈舒适 |
| 动感 | 动感 | 已是合法值 |
| 随性 | 轻松 | 随性轻松 |
| 文艺 | 抒情 | 文艺诗意 |
| 古典 | 古风 | 古典传统 |
| 恬静 | 宁静 | 安静沉稳 |
| 干练 | 自信 | 干练自信 |
| 现代 | 自信 | 现代时尚 |
| 利落 | 自信 | 干练利落 |
| 都市 | 自信 | 都市时尚 |
| 极简 | 宁静 | 极简沉稳 |
| 务实 | 轻松 | 务实舒适 |
| 沉静 | 宁静 | 沉静安稳 |

---

## 涉及表

### 1. nrm_projects 表

**字段**：`selected_role_direction` (JSONB)

**需要修改的子字段**：`selected_role_direction.styleWords`

### 2. nrm_role_direction_cards 表

**字段**：`cards_json` (JSONB 数组)

**需要修改的子字段**：`cards_json[*].styleWords`

---

## 修复 SQL

### 项目 ID：938d11fc-2900-44b6-aba5-fba18a044088

#### 1. 修改 nrm_projects 表

```sql
UPDATE nrm_projects
SET selected_role_direction = jsonb_set(
  selected_role_direction,
  '{styleWords}',
  '["阳光", "动感", "轻松"]'::jsonb
)
WHERE id = '938d11fc-2900-44b6-aba5-fba18a044088';
```

#### 2. 修改 nrm_role_direction_cards 表

```sql
UPDATE nrm_role_direction_cards
SET cards_json = '[
  {
    "age": 13,
    "gender": "female",
    "confidence": 0.92,
    "styleWords": ["阳光", "动感", "轻松"],
    "directionId": "rd-89aebe88-9234-4b7e-aea0-43e389415c54-0",
    "portraitUrl": "https://bbt-neirongmiao-v1.oss-cn-hangzhou.aliyuncs.com/storage/media/role/female/girls-01.png",
    "styleSummary": "人物预设数据已同步，可进入 Step2。",
    "ethnicityOrRegion": "Asian"
  },
  {
    "age": 14,
    "gender": "female",
    "confidence": 0.85,
    "styleWords": ["轻松", "宁静", "阳光"],
    "directionId": "rd-6dd69c25-b6b8-4bdd-8efb-4d11a9d0daf3-1",
    "portraitUrl": null,
    "styleSummary": "人物预设数据已同步，可进入 Step2。",
    "ethnicityOrRegion": "Asian"
  },
  {
    "age": 15,
    "gender": "female",
    "confidence": 0.78,
    "styleWords": ["动感", "自信", "惊喜"],
    "directionId": "rd-923201db-b564-4a0b-b172-34ce39edf9d4-2",
    "portraitUrl": null,
    "styleSummary": "人物预设数据已同步，可进入 Step2。",
    "ethnicityOrRegion": "Asian"
  },
  {
    "age": 16,
    "gender": "female",
    "confidence": 0.71,
    "styleWords": ["温暖", "浪漫", "轻松"],
    "directionId": "rd-468ecaaf-f5d2-4df1-b2f7-1851ac00dd5b-3",
    "portraitUrl": null,
    "styleSummary": "人物预设数据已同步，可进入 Step2。",
    "ethnicityOrRegion": "Asian"
  },
  {
    "age": 14,
    "gender": "female",
    "confidence": 0.64,
    "styleWords": ["动感", "轻松", "阳光"],
    "directionId": "rd-9368012c-ec17-4948-8fcd-fc004afee7b7-4",
    "portraitUrl": null,
    "styleSummary": "人物预设数据已同步，可进入 Step2。",
    "ethnicityOrRegion": "Asian"
  }
]'::jsonb
WHERE project_id = '938d11fc-2900-44b6-aba5-fba18a044088';
```

---

## 验证 SQL

```sql
-- 验证 nrm_projects
SELECT id, selected_role_direction->'styleWords' as style_words
FROM nrm_projects
WHERE id = '938d11fc-2900-44b6-aba5-fba18a044088';

-- 验证 nrm_role_direction_cards
SELECT id, project_id, cards_json->0->'styleWords' as card0_style
FROM nrm_role_direction_cards
WHERE project_id = '938d11fc-2900-44b6-aba5-fba18a044088';
```

---

## 执行日期

- 测试库修复：2026-04-28
- 正式库待执行：待定

## 备注

- 修改后无需重启后端服务
- 前端刷新页面即可生效
- 建议后续排查其他项目是否有类似问题