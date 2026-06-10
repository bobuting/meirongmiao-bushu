# 皮肤规则重构方案（统一年龄段版）

## 1. 问题诊断

### 1.1 核心问题

**儿童技能引用成人规则**：`character_five_view_generation_child` 使用了成人皮肤规则 `realisticSkinPositive`，包含 20-40+ 岁毛孔、细纹特征，不适合 2-18 岁儿童。

**年龄段不统一**：
- 业务需求：2-30 岁
- 技能定义：儿童技能标注 6-12 岁
- 规则文件：成人规则包含 20-40+ 岁
- 缺失年龄段：2-3岁、4-6岁、13-18岁、19-25岁

### 1.2 现状分析

**现有规则文件（3 个）**：
| 文件 | 内容定位 | 被引用数 | 问题 |
|------|----------|---------|------|
| `realistic-skin-positive.md` | 成人皮肤（20-40+岁） | 6 个 | **儿童技能误引用** ❌ |
| `adult-skin-enforcement.md` | 成人皮肤强制规则 | 1 个 | 年龄范围超出业务需求 ⚠️ |
| `realistic-skin.md` | 通用规则 | 0 个 | **未被引用** ❌ |

---

## 2. 统一年龄段定义

### 2.1 业务需求年龄段（2-30岁）

| 年龄段 | 英文术语 | 中文术语 | 毛孔可见性 | 瑕疵程度 | 皮肤特征 |
|--------|---------|---------|-----------|---------|---------|
| **2-3岁** | Infant | 婴童 | 几乎不可见 | 禁止所有瑕疵 | 极细腻、婴儿肥、粉嫩透亮 |
| **4-6岁** | Toddler | 幼童 | 几乎不可见 | 禁止明显瑕疵 | 极细腻、圆润脸型、自然光泽 |
| **7-12岁** | Kid | 儿童 | 极细小 | 禁止成人化瑕疵 | 细腻、均匀透亮、开始有轮廓 |
| **13-18岁** | Teen | 青少年 | 细小可见 | 可有极轻微瑕疵 | 细腻、轻微油脂、青春感 |
| **19-25岁** | YoungAdult | 年轻成人 | 细小但可见 | 可有微妙肤理变化 | 毛孔开始可见、光泽感 |
| **26-30岁** | Adult | 成人 | 可见 | 可有痣点、阴影 | 毛孔可见、肤理微妙变化 |

### 2.2 年龄段分组逻辑

```
【儿童组】（2-18岁）- 使用儿童技能
  ├─ 婴童（2-3岁）：极细腻 + 婴儿肥 + 禁止所有瑕疵
  ├─ 幼童（4-6岁）：极细腻 + 圆润 + 禁止明显瑕疵
  ├─ 儿童（7-12岁）：细腻 + 有轮廓 + 禁止成人化瑕疵
  └─ 青少年（13-18岁）：细腻 + 青春感 + 可轻微瑕疵

【成人组】（19-30岁）- 使用成人技能
  ├─ 年轻成人（19-25岁）：毛孔开始可见 + 光泽感 + 微妙变化
  └─ 成人（26-30岁）：毛孔可见 + 自然变化 + 可有痣点
```

---

## 3. 目标架构

### 3.1 规则文件架构（7 个文件）

```
skills/_shared/rules/
├── realistic-skin-base.md        # 共享基础规则（所有年龄段）
├── realistic-skin-infant.md      # 婴童规则（2-3岁）
├── realistic-skin-toddler.md     # 幼童规则（4-6岁）
├── realistic-skin-kid.md         # 儿童规则（7-12岁）
├── realistic-skin-teen.md        # 青少年规则（13-18岁）
├── realistic-skin-young-adult.md # 年轻成人规则（19-25岁）
├── realistic-skin-adult.md       # 成人规则（26-30岁）
└── facial-fidelity.md            # 五官保真规则（保持现状）
```

### 3.2 技能调整策略

**儿童技能** (`character_five_view_generation_child`)：
- **调整范围**：从 6-12岁 → 2-18岁全覆盖
- **引用策略**：Base + 根据年龄参数动态选择 Infant/Toddler/Kid/Teen

**成人技能** (5个)：
- **调整范围**：从 20-40+岁 → 19-30岁
- **引用策略**：Base + 根据年龄参数动态选择 YoungAdult/Adult

---

## 4. 详细内容规划

### 4.1 realistic-skin-base.md（共享基础）

```markdown
## REALISTIC SKIN — BASE REQUIREMENTS

皮肤必须像**真人照片**，禁止 AI 生成的完美皮肤。这是判断画面真实感的**首要标准**。

### 真实感核心理念

**强制特征**（不可跳过）：
- **真实质感**：皮肤必须有真实材质感，非扁平绘画感
- **光影立体**：侧光下皮肤有质感深度，非正面平光
- **自然过渡**：肤色有自然的微妙变化，非均匀单一色调
- **拒绝人造**：禁止塑料感、蜡像感、瓷器皮肤、AI磨皮

### 光影与立体感

**侧光下的皮肤表现**：
- 光影过渡带宽度约脸宽的 15-20%
- 阴影侧纹理仍可见
- 高光区域质感不丢失
- 鼻梁、颧骨、下颌有立体过渡

**禁止的光影问题**：
- ❌ 正面平光（抹平所有纹理和立体感）
- ❌ 过度高光（皮肤像抹油）
- ❌ 死黑阴影（阴影中看不见任何细节）

### 禁止人造成分

**禁止的人造痕迹**：
- ❌ 塑料感皮肤（plastic skin）
- ❌ 蜡像质感（wax figure appearance）
- ❌ 瓷器皮肤（porcelain skin）
- ❌ 过度磨皮（airbrushed, smooth skin）
- ❌ 无纹理皮肤（textureless skin）
- ❌ 均匀肤色（uniform skin tone）

### 基础检查清单

生成每个镜头时**必须检查**：
□ 真实质感：皮肤是否有真实材质感？
□ 光影立体：侧光下皮肤是否有质感深度？
□ 肤色变化：是否有自然的微妙变化？
□ 禁止人造成分：是否避免了塑料感、蜡像感、过度磨皮？
□ 年龄一致：皮肤特征是否符合目标年龄段？
```

### 4.2 realistic-skin-infant.md（2-3岁婴童）

```markdown
## INFANT SKIN — 2-3 YEARS OLD

婴童皮肤（2-3岁）必须具备**极细腻、婴儿肥、粉嫩透亮**特征。禁止成人化特征和任何瑕疵。

### 毛孔与肤质

**毛孔特征**：
- 毛孔极细腻（几乎不可见，近看也难以察觉）
- 皮肤柔软有弹性
- 轻盈透亮感
- **禁止**：成人般可见毛孔

**婴儿肥特征**：
- 脸型圆润饱满
- 皮肤柔软有弹性
- 颧骨和下巴线条柔和
- **禁止**：成人般轮廓分明

### 肤色特征

**粉嫩透亮要求**：
- 肤色均匀粉嫩
- 轻微自然红润（仅脸颊）
- 整体透亮感
- **禁止**：成人般肤色不均匀

### 禁止瑕疵清单

**禁止所有瑕疵**（即使参考图中有，也需评估是否保留）：
- ❌ 雀斑/晒斑（freckles/sun spots）
- ❌ 痣/美人痣（moles/beauty marks）
- ❌ 痘印/痘痘（acne marks/pimples）
- ❌ 暗斑/色素沉着（dark spots/hyperpigmentation）
- ❌ 红疹/过敏痕迹（rashes/allergy marks）

### 禁止儿童化特征（禁止 4-6岁特征）

**禁止幼童特征**：
- ❌ 幼童般轮廓感（toddler-like contour）
- ❌ 幼童般脸型（toddler-like face shape）

### 婴童强制检查清单

□ 毛孔极细腻：毛孔是否几乎不可见？
□ 婴儿肥：脸型是否圆润饱满？
□ 粉嫩透亮：肤色是否均匀粉嫩？
□ 无瑕疵：是否没有所有瑕疵？
□ 无成人化：是否没有成人般轮廓？
□ 年龄一致：皮肤特征是否符合 2-3岁婴童？
```

### 4.3 realistic-skin-toddler.md（4-6岁幼童）

```markdown
## TODDLER SKIN — 4-6 YEARS OLD

幼童皮肤（4-6岁）必须具备**极细腻、圆润脸型**特征。禁止明显瑕疵和成人化特征。

### 毛孔与肤质

**毛孔特征**：
- 毛孔极细腻（几乎不可见）
- 皮肤自然光滑（非塑料光滑）
- 自然光泽感
- **禁止**：成人般可见毛孔

**脸型特征**：
- 脸型圆润
- 颧骨和下巴线条柔和
- 开始有轻微轮廓感（非婴儿肥）
- **禁止**：成人般轮廓分明

### 禁止瑕疵清单

**禁止明显瑕疵**（参考图中有明确瑕疵则保留）：
- ❌ 雀斑/晒斑（freckles/sun spots）
- ❌ 痣/美人痣（moles/beauty marks）
- ❌ 痘印/痘痘（acne marks/pimples）
- ❌ 暗斑/色素沉着（dark spots/hyperpigmentation）

**例外情况**：
- 如果参考图中有明确瑕疵，则保留
- 否则一律禁止添加瑕疵

### 禁止成人化特征

**禁止的成人特征**：
- ❌ 成人皮肤纹理（adult skin texture）
- ❌ 额头可见毛孔（visible pores on forehead）
- ❌ 重妆效果（heavy makeup effects）
- ❌ 细纹/皱纹（fine lines/wrinkles）
- ❌ 肤色明显不均匀（uneven skin tone）

### 幼童强制检查清单

□ 毛孔极细腻：毛孔是否几乎不可见？
□ 脸型圆润：脸型是否圆润？
□ 无明显瑕疵：是否没有明显瑕疵？
□ 无成人化：是否没有成人般轮廓和纹理？
□ 年龄一致：皮肤特征是否符合 4-6岁幼童？
```

### 4.4 realistic-skin-kid.md（7-12岁儿童）

```markdown
## KID SKIN — 7-12 YEARS OLD

儿童皮肤（7-12岁）必须具备**细腻、均匀透亮**特征。禁止成人化瑕疵。

### 毛孔与肤质

**毛孔特征**：
- 毛孔极细小（近看可察觉，远看不可见）
- 皮肤自然光滑
- 均匀透亮
- **禁止**：成人般可见毛孔

**脸型特征**：
- 开始有轮廓感
- 颧骨和下巴线条开始清晰
- 非婴儿肥、非圆润
- **禁止**：成人般轮廓分明

### 禁止瑕疵清单

**禁止成人化瑕疵**（参考图中有则保留）：
- ❌ 雀斑/晒斑（freckles/sun spots）
- ❌ 痣/美人痣（moles/beauty marks）
- ❌ 痘印/痘痘（acne marks/pimples）
- ❌ 暗斑/色素沉着（dark spots/hyperpigmentation）

### 禁止成人化特征

**禁止的成人特征**：
- ❌ 成人皮肤纹理（adult skin texture）
- ❌ 额头可见毛孔（visible pores on forehead）
- ❌ 重妆效果（heavy makeup effects）
- ❌ 眼角细纹/皱纹（fine lines/wrinkles）
- ❌ 肤色明显不均匀（uneven skin tone）

### 儿童强制检查清单

□ 毛孔细小：毛孔是否极细小？
□ 有轮廓感：脸型是否开始有轮廓？
□ 无成人化瑕疵：是否没有成人化瑕疵？
□ 无成人化纹理：是否没有成人般纹理？
□ 年龄一致：皮肤特征是否符合 7-12岁儿童？
```

### 4.5 realistic-skin-teen.md（13-18岁青少年）

```markdown
## TEEN SKIN — 13-18 YEARS OLD

青少年皮肤（13-18岁）必须具备**细腻、青春感**特征。可有极轻微瑕疵。

### 毛孔与肤质

**毛孔特征**：
- 毛孔细小可见（鼻翼、额头可察觉）
- 皮肤仍有细腻感
- 可有轻微油脂（T区）
- **禁止**：成人般明显毛孔

**青春感特征**：
- 皮肤细腻但有油脂感
- 可有极轻微青春痘痕迹（如果参考图中有）
- 肤色均匀但有轻微光泽
- **禁止**：成人般肤理变化

### 瑕疵允许度

**可允许的极轻微瑕疵**（参考图中有则保留）：
- ✓ 极轻微青春痘痕迹（轻微 acne marks）
- ✓ 极轻微雀斑（subtle freckles，如果符合角色设定）

**禁止的明显瑕疵**：
- ❌ 明显痘印/痘痘（obvious acne marks/pimples）
- ❌ 明显痣点（obvious moles）
- ❌ 暗斑/色素沉着（dark spots/hyperpigmentation）

### 禁止成人化特征

**禁止的成人特征**：
- ❌ 成人皮肤纹理（adult skin texture）
- ❌ 明显毛孔（visible pores on cheeks）
- ❌ 眼角细纹/皱纹（fine lines/wrinkles）
- ❌ 肤色明显不均匀（uneven skin tone）

### 青少年强制检查清单

□ 毛孔细小可见：毛孔是否细小可见？
□ 青春感：皮肤是否有青春感？
□ 瑕疵极轻微：瑕疵是否极轻微？
□ 无成人化纹理：是否没有成人般纹理？
□ 年龄一致：皮肤特征是否符合 13-18岁青少年？
```

### 4.6 realistic-skin-young-adult.md（19-25岁年轻成人）

```markdown
## YOUNG ADULT SKIN — 19-25 YEARS OLD

年轻成人皮肤（19-25岁）必须具备**毛孔开始可见、光泽感**特征。可有微妙肤理变化。

### 毛孔与肤质

**毛孔特征**：
- 毛孔细小但可见（鼻翼、额头清晰可见）
- 脸颊毛孔仍细小
- 皮肤有光泽感
- **禁止**：儿童般极细腻毛孔

**肤理特征**：
- 可有微妙肤理变化（近看可察觉）
- T区自然微光泽
- 肤色有轻微自然变化
- **禁止**：儿童般均匀肤色

### 肤理微妙变化

**可允许的微妙变化**：
- ✓ 微妙肤理变化（subtle texture variation）
- ✓ 微小痣点（tiny moles，近看可察觉）
- ✓ 眼下极轻微阴影（subtle shadows under eyes）

**禁止的明显变化**：
- ❌ 明显肤理不均匀（obvious texture unevenness）
- ❌ 明显痣点（obvious moles）
- ❌ 明显暗斑（obvious dark spots）

### 年龄特征表格

| 年龄段 | 毛孔 | 肤理变化 | 细纹 | 肤色变化 |
|--------|------|----------|------|----------|
| **19-22岁** | 细小但可见 | 极微妙 | 无 | 轻微自然变化 |
| **23-25岁** | 细小但可见 | 微妙 | 眼角若隐若现的极细纹 | 明显自然变化 |

### 年轻成人强制检查清单

□ 毛孔可见：毛孔是否细小但可见？
□ 光泽感：皮肤是否有光泽感？
□ 微妙变化：肤理变化是否微妙？
□ 年龄一致：皮肤特征是否符合 19-25岁年轻成人？
```

### 4.7 realistic-skin-adult.md（26-30岁成人）

```markdown
## ADULT SKIN — 26-30 YEARS OLD

成人皮肤（26-30岁）必须具备**毛孔可见、肤理微妙变化**特征。可有痣点、阴影。

### 毛孔与肤质

**毛孔特征**：
- 毛孔可见（鼻翼、额头、脸颊可察觉）
- 皮肤有真实质感
- 肤色自然变化
- **禁止**：儿童般极细腻毛孔

**肤理特征**：
- 可有肤理微妙变化
- T区自然光泽
- 肤色自然不均匀
- **禁止**：儿童般均匀肤色

### 肤理微妙变化

**可允许的变化**：
- ✓ 肤理微妙变化（texture variation）
- ✓ 微小痣点（tiny moles）
- ✓ 眼下轻微阴影（subtle shadows under eyes）
- ✓ 眼角若隐若现的极细纹（subtle fine lines at eye corners）

**禁止的明显变化**：
- ❌ 明显肤理不均匀（obvious texture unevenness）
- ❌ 明显痣点（obvious moles）
- ❌ 明显暗斑（obvious dark spots）

### 年龄特征表格

| 年龄段 | 毛孔 | 肤理变化 | 细纹 | 肤色变化 |
|--------|------|----------|------|----------|
| **26-28岁** | 可见 | 微妙 | 眼角若隐若现的极细纹 | 明显自然变化 |
| **29-30岁** | 可见 | 自然 | 眼角、额头隐约细纹 | 显著自然变化 |

### 成人强制检查清单

□ 毛孔可见：毛孔是否可见？
□ 肤理变化：肤理是否有微妙变化？
□ 年龄一致：皮肤特征是否符合 26-30岁成人？
□ 细纹存在：是否有对应年龄的自然细纹？
```

---

## 5. 技能引用调整

### 5.1 儿童技能调整（1个）

**技能**：`character_five_view_generation_child`

**当前定义**：6-12岁

**调整后定义**：2-18岁（婴童、幼童、儿童、青少年）

**引用策略**：动态选择规则

```handlebars
{{{sharedRules.realisticSkinBase}}}

{{#if (eq ageGroup "infant")}}
{{{sharedRules.realisticSkinInfant}}}
{{else if (eq ageGroup "toddler")}}
{{{sharedRules.realisticSkinToddler}}}
{{else if (eq ageGroup "kid")}}
{{{sharedRules.realisticSkinKid}}}
{{else if (eq ageGroup "teen")}}
{{{sharedRules.realisticSkinTeen}}}
{{/if}}
```

**SKILL.md 元数据调整**：
```yaml
includes:
  rules:
    - realistic-skin-base
    - realistic-skin-infant
    - realistic-skin-toddler
    - realistic-skin-kid
    - realistic-skin-teen
```

### 5.2 成人技能调整（5个）

**技能**：
- `character_five_view_generation`
- `character_five_view_generation_outfit_portrait`
- `character_five_view_generation_real_portrait`
- `prompt_rewrite_image`
- `shot_prompt_engineer`

**当前定义**：20-40+岁

**调整后定义**：19-30岁（年轻成人、成人）

**引用策略**：动态选择规则

```handlebars
{{{sharedRules.realisticSkinBase}}}

{{#if (eq ageGroup "youngAdult")}}
{{{sharedRules.realisticSkinYoungAdult}}}
{{else if (eq ageGroup "adult")}}
{{{sharedRules.realisticSkinAdult}}}
{{/if}}
```

**SKILL.md 元数据调整**：
```yaml
includes:
  rules:
    - realistic-skin-base
    - realistic-skin-young-adult
    - realistic-skin-adult
```

---

## 6. 执行计划

### 6.1 Phase 1：创建新规则文件（7个）

**步骤**：
1. 创建 `realistic-skin-base.md`（共享基础）
2. 创建 `realistic-skin-infant.md`（2-3岁）
3. 创建 `realistic-skin-toddler.md`（4-6岁）
4. 创建 `realistic-skin-kid.md`（7-12岁）
5. 创建 `realistic-skin-teen.md`（13-18岁）
6. 创建 `realistic-skin-young-adult.md`（19-25岁）
7. 创建 `realistic-skin-adult.md`（26-30岁）

**验证**：
```bash
npm run skills:validate realistic-skin-base
npm run skills:validate realistic-skin-infant
npm run skills:validate realistic-skin-toddler
npm run skills:validate realistic-skin-kid
npm run skills:validate realistic-skin-teen
npm run skills:validate realistic-skin-young-adult
npm run skills:validate realistic-skin-adult
```

### 6.2 Phase 2：调整技能引用（6个）

**步骤**：
1. 修改 `character_five_view_generation_child`（2-18岁）
2. 修改 `character_five_view_generation`（19-30岁）
3. 修改 `character_five_view_generation_outfit_portrait`（19-30岁）
4. 修改 `character_five_view_generation_real_portrait`（19-30岁）
5. 修改 `prompt_rewrite_image`（19-30岁）
6. 修改 `shot_prompt_engineer`（19-30岁）

**验证**：
```bash
npm run skills:validate character_five_view_generation_child
npm run skills:validate character_five_view_generation
# ... 其他 4 个技能
```

### 6.3 Phase 3：清理废弃文件（3个）

**步骤**：
1. 删除 `realistic-skin-positive.md`
2. 删除 `adult-skin-enforcement.md`
3. 删除 `realistic-skin.md`

**验证**：
```bash
npm run skills:check  # 确保无依赖断裂
```

### 6.4 Phase 4：测试验证

**步骤**：
1. 测试儿童技能渲染（各年龄段）
2. 测试成人技能渲染（各年龄段）
3. 检查输出是否符合年龄段特征

**验证命令**：
```bash
npm run skills:test character_five_view_generation_child -- -e 0
npm run skills:test character_five_view_generation -- -e 0
npm run skills:test shot_prompt_engineer -- -e 0
```

---

## 7. 预期效果

### 7.1 问题修复

| 问题 | 修复状态 |
|------|---------|
| 儿童技能引用成人规则 | ✅ 改为年龄段动态选择 |
| 年龄段不统一 | ✅ 统一为 2-30岁 6 段 |
| 年龄范围超出业务需求 | ✅ 严格限定在 2-30岁 |
| 规则职责不清晰 | ✅ 每年龄段独立规则 |

### 7.2 架构优化

| 指标 | 优化前 | 优化后 |
|------|--------|--------|
| 规则文件数 | 3 个（含废弃） | 7 个（有效） |
| 年龄段覆盖 | 20-40+岁 | 2-30岁 |
| 年龄段精度 | 3 段（20-29/30-39/40+） | 6 段（精确分段） |
| 规则定位清晰度 | 模糊 | 清晰（每段独立） |
| 技能适应性 | 固定规则 | 动态选择规则 |

---

## 8. 风险评估

### 8.1 潜在风险

| 风险 | 等级 | 缓解措施 |
|------|------|----------|
| 引用断裂 | 中 | 运行 `npm run skills:check` 验证 |
| 动态选择失败 | 中 | 测试各年龄段渲染 |
| 年龄参数缺失 | 低 | 添加默认年龄段逻辑 |
| 内容遗漏 | 低 | 逐行对比新旧文件 |

### 8.2 回滚方案

```bash
# 回滚到原始状态
git checkout skills/_shared/rules/
git checkout skills/*/system.hbs
git checkout skills/*/SKILL.md
```

---

## 9. 后续维护建议

### 9.1 规则更新流程

**修改共享规则**：
- 修改 `realistic-skin-base.md` → 影响所有年龄段
- 运行全量测试验证

**修改年龄段规则**：
- 修改对应年龄段文件 → 仅影响该年龄段
- 运行该年龄段测试验证

### 9.2 新增年龄段流程

如果业务扩展年龄段（如 30-40岁）：
1. 创建新的规则文件（如 `realistic-skin-mature-adult.md`）
2. 在技能中添加动态选择逻辑
3. 更新 SKILL.md 元数据
4. 运行测试验证

### 9.3 技能引用模板

**儿童技能（2-18岁）**：
```yaml
includes:
  rules:
    - realistic-skin-base
    - realistic-skin-infant    # 2-3岁
    - realistic-skin-toddler   # 4-6岁
    - realistic-skin-kid       # 7-12岁
    - realistic-skin-teen      # 13-18岁
```

**成人技能（19-30岁）**：
```yaml
includes:
  rules:
    - realistic-skin-base
    - realistic-skin-young-adult  # 19-25岁
    - realistic-skin-adult        # 26-30岁
```