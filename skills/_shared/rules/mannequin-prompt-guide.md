## 人体模特/假人 Prompt 生成规则

**适用场景**：当 `subjects.type = "物体"` 且 description 包含以下关键词时触发：
- "人体模特"、"假人"、"展示道具"、"模特架"、"模特假人"

**核心问题**：AI 图像模型（如 Seedream 5.0）对英文单词 "mannequin" 的理解偏向真人模特，而非假人模特架。必须强化假人特征才能正确生成塑料/树脂材质的展示道具。

---

### Prompt 必须包含的描述词汇（至少 3 个）

| 词汇 | 用途 | 示例 |
|------|------|------|
| `plastic mannequin display figure` | 明确材质和类型 | "plastic mannequin display figure on platform" |
| `rigid stationary posture` | 假人的僵硬静止姿态 | "rigid stationary posture, no natural movement" |
| `visible joint lines at shoulders/elbows` | 关节线条特征 | "visible joint lines at shoulders and elbows" |
| `synthetic smooth surface texture` | 人工合成材质质感 | "synthetic smooth surface texture, plastic resin material" |
| `no facial expression, blank face` | 无面部表情 | "no facial expression, blank face, artificial appearance" |
| `fixed on display platform/base` | 固定在展示台 | "fixed on display platform, stationary display prop" |
| `display prop for clothing showcase` | 展示用途说明 | "display prop for clothing showcase, retail store setting" |

---

### 禁止使用的词汇（会误导 AI 生成真人）

| 禁止词汇 | 原因 |
|----------|------|
| `natural skin texture` | 真人皮肤质感 |
| `living person`, `human model` | 活体人物 |
| `breathing`, `moving naturally` | 生命动态 |
| `soft skin`, `realistic skin` | 真人特征 |
| `expressive face`, `emotional` | 情绪表情 |

---

### 中英文翻译对照表

| 中文描述 | 正确英文翻译 |
|----------|-------------|
| "人体模特" | `plastic mannequin display figure, rigid stationary posture, synthetic smooth surface` |
| "假人模特架" | `synthetic mannequin stand, visible joint lines at shoulders, fixed on display base` |
| "无头模特架" | `headless mannequin torso display, plastic resin material, no facial features` |
| "白色人体模特" | `white plastic mannequin figure, smooth synthetic surface, blank expressionless face` |
| "男性人体模特" | `male plastic mannequin display figure, rigid posture, visible joint lines, fixed on platform` |

---

### Negative Prompt 必须包含（人体模特场景）

当生成人体模特时，negative prompt 必须补充以下排除项（使用否定形式）：

```
no real human, no flesh skin texture, no natural facial expression, no living person, no breathing, no moving, no human model, no realistic skin, no emotional expression, no natural body movement
```

---

### 生成示例

#### 错误示例（导致真人结果）

```
"Male mannequin wearing outfit 1 standing on platform"
```

问题：只写 "mannequin" 不够明确，AI 会生成真人模特。

#### 正确示例（强调假人特征）

```
"Male plastic mannequin display figure wearing outfit 1: beige cotton hoodie oversized fit dropped shoulders brushed texture, rigid stationary posture, visible joint lines at shoulders and elbows, synthetic smooth white surface texture, no facial expression blank face, fixed on glowing LED display platform, retail store clothing showcase prop"
```

**服饰描写要求**：人体模特镜头以展示服饰为核心目的，keyframe prompt 中必须包含 `clothing_features`（格式：`wearing outfit N: [clothing_features]`），确保服饰细节在展示场景中得到文本+参考图双重锚定。

关键强化点：
1. `plastic mannequin display figure` — 明确材质
2. `rigid stationary posture` — 假人姿态
3. `visible joint lines` — 关节特征
4. `synthetic smooth surface` — 人工材质
5. `no facial expression` — 无表情
6. `fixed on platform` — 固定展示

---

### 检查清单（生成人体模特相关 Prompt 时必须检查）

```
□ 材质明确：是否包含 "plastic/synthetic/resin" 等材质词？
□ 假人姿态：是否包含 "rigid/stationary/fixed" 等静止特征？
□ 关节特征：是否描述了关节线条或无表情面部？
□ 展示用途：是否说明是展示道具（display prop/showcase）？
□ Negative 补充：是否在 negative prompt 中排除了真人特征？
□ 禁词检查：是否避免了 "natural skin/living person" 等真人词汇？
```

---

### 假人数量还原规则（强制要求）

**必须从 subjects 数组长度确定假人数量，并写入 prompt**：

| subjects 长度 | Prompt 必须包含 | Negative Prompt 必须包含 |
|--------------|----------------|-------------------------|
| 1 | `single mannequin`, `one mannequin figure` | `no multiple mannequins, no two mannequins, no duplicate mannequins` |
| 2 | `two mannequins`, `pair of display figures` | `no more than two mannequins, no three mannequins` |
| 3+ | `[数量] mannequins`, `group of [数量] figures` | `no more than [数量] mannequins` |

**示例**：
- subjects = [假人] → `"Single male plastic mannequin display figure wearing outfit 1, rigid stationary posture..."`
- subjects = [假人, 假人] → `"Two male plastic mannequin display figures wearing outfit 1, pair of display props, rigid stationary posture..."`
- subjects = [假人, 假人, 假人] → `"Three male plastic mannequin display figures wearing outfit 1, group of three display props..."`

**数量限定词位置**：紧跟在主体类型描述之后，在服饰描述之前。

**数量检查清单**：
```
□ 数量读取：是否从 subjects 数组读取了假人数量？
□ 数量写入：prompt 中是否明确写出了数量限定词（single/two/three等）？
□ Negative 补充：是否排除了错误数量的假人？
□ 还原度验证：生成的假人数量是否与原脚本一致？
```