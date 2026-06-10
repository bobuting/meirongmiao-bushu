---
name: character-outfit-anchors
description: 角色服饰锚点铁律 - 确保用户角色=person_id=1，用户服饰=ref="搭配1"
type: rule
priority: critical
---

## 角色服饰锚点铁律（最高优先级，不可违反）

**背景**：用户提供的角色和服饰需要在最终视频中完美展示。视频生成 API 不支持特征匹配，只能通过编号约定进行锚点。

### 铁律 1：用户角色优先分配 person_id = 1

**这是最高优先级规则，不可因出场顺序、戏份多少等理由违反。**

| 规则 | 正确 | 错误 |
|------|------|------|
| 用户提供的角色必须分配 `person_id = 1` | `person_id: 1` | `person_id: 2` ❌ |
| 即使用户角色戏份少、出场晚也必须是 1 | 用户角色第3个出场也分配 1 | 按出场顺序分配 1, 2, 3 ❌ |
| 配角必须从 `person_id = 2` 开始 | 第二个角色 = 2 | 配角抢夺 1 ❌ |

**判断标准**：
- `characterGender`、`characterDescription`、`characterLabel` 中描述的角色 = 用户角色 = `person_id = 1`
- 如果输入没有角色信息，则默认第一个出现的角色 = `person_id = 1`

### 铁律 2：用户服饰统一锚点为 "搭配1"

| 规则 | 正确 | 错误 |
|------|------|------|
| 用户提供的服饰锚点必须为 `"搭配1"` | `ref: "搭配1"` | `ref: "搭配2"` ❌ |
| 服饰锚点跨所有镜头保持一致 | 镜头 1-10 都是 "搭配1" | 镜头 5 变成 "搭配2" ❌ |

**判断标准**：
- `outfitDescription`、`clothingStyles` 中描述的服饰 = 用户服饰 = `"搭配1"`
- 如果输入有多套服饰，第一套 = "搭配1"，第二套 = "搭配2"（按顺序）

### 铁律 3：配角后分配，服饰按序

| 规则 | 示例 |
|------|------|
| 配角按出场顺序分配 `person_id = 2, 3, ...` | 第二个出现的角色 = 2，第三个 = 3 |
| 配角服饰按顺序锚点 | 配角服饰 = "搭配2"（如果有多套） |

### 错误示例与修正

**错误输入**：
```json
{
  "characterGender": "female",
  "characterDescription": "25岁都市白领",
  "outfitDescription": "白色衬衫配黑色西裤"
}
```

**错误输出**：
```json
{
  "person_details": [
    { "person_id": 1, "description": "男性配角", "gender": "male" },
    { "person_id": 2, "description": "25岁都市白领", "gender": "female" }
  ],
  "shot_breakdown": [
    { "subjects": [{ "person_id": 2, "clothing": { "ref": "搭配2" } }] }
  ]
}
```
❌ 用户角色被分配为 person_id = 2
❌ 用户服饰被分配为 搭配2

**正确输出**：
```json
{
  "person_details": [
    { "person_id": 1, "description": "25岁都市白领", "gender": "female" },
    { "person_id": 2, "description": "男性配角", "gender": "male" }
  ],
  "shot_breakdown": [
    { "subjects": [{ "person_id": 1, "clothing": { "ref": "搭配1" } }] }
  ]
}
```
✅ 用户角色 = person_id = 1
✅ 用户服饰 = 搭配1

### 单角色脚本优化

如果脚本只需要一个角色，**必须使用 `person_id = 1` 和 `ref = "搭配1"`**，不得使用其他编号。

```json
{
  "person_details": [
    { "person_id": 1, "description": "用户角色描述" }
  ],
  "shot_breakdown": [
    { "subjects": [{ "person_id": 1, "clothing": { "ref": "搭配1" } }] }
  ]
}
```

### 多套服饰场景

如果用户输入包含多套服饰（如服装搭配推荐场景）：

| 服饰顺序 | person_id | clothing.ref |
|----------|-----------|--------------|
| 第一套（用户首选） | 1 | "搭配1" |
| 第二套 | 1 | "搭配2" |
| 第三套 | 1 | "搭配3" |

**注意**：同一角色的不同搭配，person_id 保持不变，ref 按顺序递增。
