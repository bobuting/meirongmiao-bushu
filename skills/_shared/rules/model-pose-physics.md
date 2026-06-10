## MODEL POSE PHYSICS — CRITICAL

模特姿势必须具备**物理真实性**，拒绝AI典型的人造姿势（飘浮、僵硬、无重心）。

### 核心原则

**强制要求**：
- **重心明确**：每个姿势必须有明确的身体重心位置
- **阻力感**：姿势必须体现身体对抗外力（重力、空气、地面）
- **重量感**：动作必须有重量感（沉重或轻盈），不能飘浮
- **环境交互**：姿势必须体现与环境的关系（站立、倚靠、行走）

### 站立姿势物理化

**重心分布**：
- **自然站立**：重心均匀分布在双脚，肩部自然下沉
- **单腿重心**：重心主要在一只脚，另一脚轻点地面
- **转身站立**：重心从一脚转移到另一脚，上身随腰部扭转

**禁止问题**：
- ❌ 僵硬直立（stiff upright posture, military stance）
- ❌ 重心不明（no clear weight distribution）
- ❌ 飘浮站立（floating stance, no ground contact）

**正确示例**：
```
"standing with natural posture, weight evenly distributed on both feet, shoulders relaxed and下沉, arms naturally by sides, fingers loosely curled"
```

### 行走姿势物理化

**步伐物理化**：
- **脚步重量**：每一步必须有重量感（轻快或沉稳）
- **重心转移**：重心随步伐自然转移
- **地面交互**：脚步与地面产生自然接触

**禁止问题**：
- ❌ 飘浮行走（floating walk, no ground contact）
- ❌ 无重量感（weightless movement）
- ❌ 重心不转移（no weight shift）

**正确示例**：
```
"walking towards camera with natural stride, weight shifting with each step, feet firmly contacting ground, light and confident pace"
```

### 坐姿倚靠物理化

**坐姿重心**：
- **臀部重心**：重心主要在臀部，身体重量自然下沉
- **背部倚靠**：倚靠时有重量转移感
- **腿部姿态**：腿部自然放置，非僵硬伸直或弯曲

**禁止问题**：
- ❌ 飘浮坐姿（floating seated posture）
- ❌ 僵硬倚靠（stiff leaning）
- ❌ 无重量感（weightless seated）

**正确示例**：
```
"sitting on stool with natural posture, weight settled on hips, back gently leaning against wall, legs relaxed and slightly bent"
```

### 手部姿态物理化

**手部位置**：
- **自然垂放**：手臂自然垂于身侧，手指自然微曲
- **腰部位置**：手轻搭腰间，有重量感
- **物品交互**：手持物品时有真实的握持感

**禁止问题**：
- ❌ 僵硬手指（stiff fingers, rigid hand pose）
- ❌ 无重量感手部（weightless hands）
- ❌ 独立手部动作（disconnected hand movement）

**正确示例**：
```
"arms naturally by sides, fingers loosely curled with relaxed tension, hands with natural weight feeling"
```

### 服饰与身体物理关系

**重力影响**：
- **服饰下垂**：服饰受重力影响自然下垂
- **褶皱产生**：站立、坐姿时服饰有自然褶皱
- **贴合感**：服饰与身体有真实的贴合关系

**禁止问题**：
- ❌ 飘浮服饰（floating garments, no gravity effect）
- ❌ 无褶皱服饰（wrinkle-free garments）
- ❌ 不贴合服饰（disconnected garments）

**正确示例**：
```
"garments naturally draping under gravity, natural folds at waist and shoulders, fabric settling with body posture"
```

### 姿势描述模板

**posePrompt物理化模板**：
```
[重心位置] + [身体姿态] + [阻力感] + [重量感] + [环境交互]

示例：
"standing with weight evenly distributed, natural posture, shoulders relaxed下沉, arms naturally by sides with weight feeling, feet firmly on ground, confident stance"
```

### 强制检查清单

生成每个posePrompt时必须检查：

```
□ 重心位置：是否明确写了重心分布（双脚/单脚/臀部）？
□ 身体姿态：是否描述了自然的肩部、手臂、腿部状态？
□ 阻力感：是否体现了身体对抗外力（重力、地面）？
□ 重量感：是否描述了动作的重量感（沉重或轻盈）？
□ 禁止问题：是否避免了飘浮、僵硬、无重心？
□ 服饰关系：是否描述了服饰与身体的物理关系？
```