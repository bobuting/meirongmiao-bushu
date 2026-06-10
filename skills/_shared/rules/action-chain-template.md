# 动作五环节显式模板

> 为动态视频 prompt 提供显式动作链条结构，确保动作描述有完整的起承转合。

## 五环节链条模板

每个动态动作应描述完整的 5 个环节：

```
1. 起始姿态 (start pose): 动作开始前的身体状态
2. 运动方向 (motion direction): 动作的轨迹和速度
3. 接触点 (contact point): 动作与环境/物体的接触瞬间
4. 冲击反应 (impact reaction): 接触后的物理反馈
5. 环境响应 (environment response): 环境因动作产生的变化
```

### 示例：跑步动作
```
1. 起始: 右脚着地，左膝抬起准备跨步，身体微微前倾
2. 方向: 左脚向前迈出，身体沿前进方向加速，双臂前后摆动配合步频
3. 接触: 左脚掌着地，膝盖弯曲吸收冲击力
4. 反应: 身体重心前移越过支撑脚，肌肉收缩蓄力
5. 环境: 地面灰尘被脚步扬起，空气流动带起衣角和发丝
```

### 示例：转身展示（电商常见）
```
1. 起始: 模特正面朝向镜头，双手自然下垂，重心在双脚之间
2. 方向: 身体向右侧旋转90度，脚掌为轴转动，头部跟随身体转向
3. 接触: 转身完成时双脚稳稳着地，重心从双脚转移到右脚为主
4. 反应: 服饰随转身动作自然飘动后归位，头发甩动后缓缓落下
5. 环境: 背景因视角变化呈现不同景深，地面有轻微的脚步声感
```

### 示例：行走展示（电商常见）
```
1. 起始: 模特站立准备起步，一只脚微微后移蓄力
2. 方向: 向前行走，步幅适中展现服饰流动感，节奏从容
3. 接触: 每一步脚跟着地过渡到脚尖，膝盖微屈吸收震动
4. 反应: 身体重心自然前后交替，双臂随步伐轻摆
5. 环境: 衣摆随步伐轻微摆动，地面脚步声隐约可感
```

## 环境冲击响应条目

当动作与环境发生交互时，选择匹配的环境响应：

| 环境 | 冲击响应 |
|------|----------|
| 泥土地面 | debris scattering on impact, dust cloud rising from contact point |
| 水面 | water splashing outward, ripples expanding from contact point, droplets suspended in air |
| 烟雾/雾气 | smoke swirling around moving figure, fog parting and closing behind |
| 地面冲击 | shockwave visible in nearby dust/leaves, ground vibration displacing small objects |
| 衣物冲击 | cloth deforming on impact, fabric rippling outward from contact point, clothing settling after motion stops |

## 角色-物体交互链条（拿起/触碰/操控道具时必用）

当角色与场景中的道具发生交互（拿起、触碰、移动、操控），必须描述完整的 4 步因果链：

```
1. 手部接近：手伸向道具所在位置
2. 接触抓取：手指接触道具并握住
3. 物体位移：道具离开原位置，原位置变空或留痕
4. 到达新位：道具到达目标位置，明确握持方式
```

### 示例：从地上拿起包放到腿上
```
1. 手部接近: right arm reaches down toward brown handbag resting on ground beside chair
2. 接触抓取: right hand contacts bag strap, fingers wrap around leather handle, grip tightens
3. 物体位移: handbag lifts off ground, original spot now empty showing faint grass impression
4. 到达新位: handbag arrives onto lap, both hands holding bag steady on thighs
```

### 示例：从桌上拿起杯子
```
1. 手部接近: left arm extends toward white ceramic cup on wooden desk
2. 接触抓取: left hand contacts cup, thumb and fingers wrap around ceramic body
3. 物体位移: cup lifts off desk surface, desk now clear where cup rested, faint ring mark visible
4. 到达新位: cup brought up to chest level, right hand joins to support cup base
```

### 禁止的跳步写法

| 跳步类型 | 错误示例 | 问题 |
|---------|---------|------|
| 跳过接近+抓取 | "fingers begin organizing bag contents" | 从哪来的包？手怎么碰到的？ |
| 跳过位移 | "handbag on lap, fingers organizing" | 包怎么从地上到腿上的？ |
| 只有结果 | "holding bag on lap" | 缺少整个过程 |

## 高动态动作专用规则

> 仅适用于动作强度较高的分镜（追逐、打斗、运动等），日常步行/站立/转身等简单动作使用上方的基本链条即可。

对于高动态场景：

1. **保留冲突动作**：直接对抗的动作要描述力的对抗（如"双臂交叉挡住冲击，肌肉紧绷对抗来力"）
2. **签名动作识别**：如果分镜中有标志性的关键动作，给予最多描述权重
3. **高潮动作聚焦**：动作高潮处描述最细，前后过渡可简略
4. **单镜头路径**：一个镜头内只描述一条完整的动作路径，不要分支描述多个并行动作
