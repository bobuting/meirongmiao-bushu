# 统一年龄段修改清单

## 1. 统一年龄段定义

**文件**：`src/constants/age-groups.ts`（已创建）

**定义**：
```typescript
年龄段（6段，无重叠）：
- INFANT（2-3岁）：婴童
- TODDLER（4-6岁）：幼童
- KID（7-12岁）：儿童
- TEEN（13-18岁）：青少年
- YOUNG_ADULT（19-25岁）：年轻成人
- ADULT（26-30岁）：成人
```

---

## 2. 需要修改的文件清单

### 2.1 核心类型定义（高优先级）

| 文件 | 当前定义 | 修改内容 | 影响 |
|------|----------|----------|------|
| `src/contracts/types.ts` | `TargetAgeRange = "2-6" \| "6-8" \| "8-12" \| "12-16" \| "16-18" \| "18-22" \| "22-30" \| "all"` | 改为引用 `AgeGroupRange` | 服饰适穿属性 |
| `src/contracts/provider-route-keys.ts` | `isChildAgeRange()` 函数逻辑 | 改为使用 `isChildAgeGroup()` | LLM RouteKey 选择 |
| `src/contracts/step1-role-preset-governance-contract.ts` | `STEP1_ROLE_PRESET_MIN_AGE = 2` | 改为引用 `MIN_AGE` | 角色预设约束 |

### 2.2 审美特征库（高优先级）

| 文件 | 当前定义 | 修改内容 | 影响 |
|------|----------|----------|------|
| `src/modules/admin-aesthetic-library-service.ts` | `AgeRange = "child_6-12" \| "adult_18-30"` | 改为引用统一类型 | 审美库分类 |
| `src/modules/aesthetic-library-update-service.ts` | `AgeRange = 'child_6-12' \| 'adult_18-30'` | 改为引用统一类型 | 审美库更新 |

### 2.3 前端显示（中优先级）

| 文件 | 当前定义 | 修改内容 | 影响 |
|------|----------|----------|------|
| `apps/web/pages/project-flow/step1RoleDirectionDrawerPanel.tsx` | `if (age <= 6) return "2-6岁"` | 改为使用 `getAgeGroupByAge()` | 角色方向提示 |

### 2.4 情绪原型库（中优先级）

| 文件 | 当前定义 | 修改内容 | 影响 |
|------|----------|----------|------|
| `src/modules/video-step/step3-emotion-archetype/archetype-library.ts` | `suitableAge: ["20-40"]` | 改为使用 `AgeGroupRange[]` | 情绪原型适用年龄 |

### 2.5 皮肤规则技能（中优先级）

| 文件 | 当前定义 | 修改内容 | 影响 |
|------|----------|----------|------|
| `skills/character_five_view_generation_child/SKILL.md` | 注释：儿童角色（age 6-12） | 改为：儿童角色（age 2-18） | 技能定位 |
| `skills/_shared/rules/*.md` | 年龄段定义 | 改为引用统一年龄段 | 规则文件 |

---

## 3. 修改步骤

### Phase 1：修改核心类型定义

**步骤**：

1. **修改 `contracts/types.ts`**：
```typescript
// 导入统一类型
import { AgeGroupRange } from "../constants/age-groups.js";

// 删除旧的 TargetAgeRange 定义
// export type TargetAgeRange = "2-6" | "6-8" | "8-12" | "12-16" | "16-18" | "18-22" | "22-30" | "all";

// 使用统一类型
export type TargetAgeRange = AgeGroupRange | "all";
```

2. **修改 `contracts/provider-route-keys.ts`**：
```typescript
// 导入统一函数
import { isChildAgeGroup, getAgeGroupByRange, AgeGroupRange } from "../constants/age-groups.js";

// 重写 isChildAgeRange 函数
export function isChildAgeRange(ageRange: AgeGroupRange): boolean {
  const ageGroup = getAgeGroupByRange(ageRange);
  return isChildAgeGroup(ageGroup);
}
```

3. **修改 `contracts/step1-role-preset-governance-contract.ts`**：
```typescript
// 导入统一常量
import { MIN_AGE, MAX_AGE } from "../constants/age-groups.js";

// 删除旧的常量定义
// export const STEP1_ROLE_PRESET_MIN_AGE = 2;

// 使用统一常量
export const STEP1_ROLE_PRESET_MIN_AGE = MIN_AGE;
export const STEP1_ROLE_PRESET_MAX_AGE = MAX_AGE;
```

### Phase 2：修改审美特征库

1. **修改 `admin-aesthetic-library-service.ts`**：
```typescript
// 导入统一类型
import { AgeGroupRange, AGE_GROUP_RANGES } from "../constants/age-groups.js";

// 删除旧的 AgeRange 定义
// export type AgeRange = "child_6-12" | "adult_18-30";

// 使用统一类型
export type AgeRange = AgeGroupRange;

// 修改数据库查询（需要适配）
// age_range = 'child_6-12' → age_range IN ('2-3', '4-6', '7-12', '13-18')
// age_range = 'adult_18-30' → age_range IN ('19-25', '26-30')
```

2. **修改 `aesthetic-library-update-service.ts`**：
```typescript
// 导入统一类型
import { AgeGroupRange, AGE_GROUP_RANGES } from "../constants/age-groups.js";

// 删除旧的 AgeRange 定义
// export type AgeRange = 'child_6-12' | 'adult_18-30';

// 使用统一类型
export type AgeRange = AgeGroupRange;
```

### Phase 3：修改前端显示

**修改 `step1RoleDirectionDrawerPanel.tsx`**：
```typescript
// 导入统一函数
import { getAgeGroupByAge, AGE_GROUPS } from "@/constants/age-groups";

// 删除旧的判断逻辑
// if (age <= 6) return "2-6岁";
// if (age <= 12) return "7-12岁";

// 使用统一函数
const ageGroup = getAgeGroupByAge(age);
return `${AGE_GROUPS[ageGroup].range}岁`;
```

### Phase 4：修改情绪原型库

**修改 `archetype-library.ts`**：
```typescript
// 导入统一类型
import { AgeGroupRange } from "../../constants/age-groups.js";

// 修改 suitableAge 类型
suitableAge: AgeGroupRange[];

// 修改数据
// suitableAge: ["20-40"] → suitableAge: ["19-25", "26-30"]
```

### Phase 5：修改技能规则

**修改皮肤规则方案**（`docs/skin-rules-refactor-plan.md`）：
- 已引用统一年龄段定义

**修改技能 SKILL.md**：
- `character_five_view_generation_child/SKILL.md`：儿童角色（age 6-12） → 儿童角色（age 2-18）

---

## 4. 数据库迁移

**问题**：审美特征库数据库中存储的是 `child_6-12` 和 `adult_18-30`

**迁移方案**：
1. 新增字段 `age_range_new` 存储新的年龄段
2. 迁移数据：
   - `child_6-12` → `'7-12'`（暂不细分婴童/幼童）
   - `adult_18-30` → `'19-25'` 或 `'26-30'`（需根据实际数据判断）
3. 删除旧字段 `age_range`，重命名 `age_range_new` 为 `age_range`

**或采用渐进式迁移**：
- 新代码支持新格式
- 旧数据保持旧格式，读取时转换为新格式

---

## 5. 验证检查

**编译验证**：
```bash
npm run build
```

**类型检查**：
```bash
npm run tsc --noEmit
```

**技能验证**：
```bash
npm run skills:check
npm run skills:validate character_five_view_generation_child
```

**运行验证**：
- 测试角色预设年龄输入（2-30）
- 测试审美特征库查询
- 测试皮肤规则渲染

---

## 6. 回滚方案

如果出现问题：
```bash
git checkout src/constants/age-groups.ts
git checkout src/contracts/types.ts
git checkout src/contracts/provider-route-keys.ts
git checkout src/modules/admin-aesthetic-library-service.ts
git checkout apps/web/pages/project-flow/step1RoleDirectionDrawerPanel.tsx
```

---

## 7. 注意事项

**数据库兼容性**：
- 审美特征库数据库存储格式需要迁移
- 迁移前需备份数据

**API 兼容性**：
- 外部 API 可能使用旧年龄段格式
- 需要添加兼容层转换

**文档更新**：
- 更新 CLAUDE.md 年龄段说明
- 更新技能文档年龄范围

**测试覆盖**：
- 测试各年龄段边界值（2, 3, 4, 6, 7, 12, 13, 18, 19, 25, 26, 30）
- 测试超出范围年龄（1, 31）