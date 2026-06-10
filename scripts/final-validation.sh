#!/bin/bash

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

PASSED=0
FAILED=0

check() {
  local name=$1
  local command=$2
  echo -n "检查: $name ... "
  if eval "$command" > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC}"
    ((PASSED++))
  else
    echo -e "${RED}✗${NC}"
    ((FAILED++))
    echo "  命令: $command"
  fi
}

echo -e "${YELLOW}=== Skills 系统最终验证 ===${NC}\n"

# 1. 文件结构检查
echo -e "${YELLOW}1. 文件结构${NC}"
check "skills/ 目录存在" "[ -d skills ]"
check "README.md 存在" "[ -f skills/README.md ]"
check "script-generation 存在" "[ -d skills/script-generation ]"
check "storyboard-generation 存在" "[ -d skills/storyboard-generation ]"

# 2. 依赖检查
echo -e "\n${YELLOW}2. 依赖${NC}"
check "handlebars 已安装" "npm list handlebars --depth=0"
check "zod 已安装" "npm list zod --depth=0"
check "commander 已安装" "npm list commander --depth=0"

# 3. TypeScript 编译
echo -e "\n${YELLOW}3. TypeScript 编译${NC}"
check "后端编译成功" "npm run build"

# 4. Skills 完整性
echo -e "\n${YELLOW}4. Skills 完整性${NC}"
check "SkillLoader 可导入" "node -e \"import('./dist/services/skills/skill-loader.js').then(() => console.log('OK'))\""
check "所有 Skills 可加载" "node -e \"import('./dist/services/skills/skill-loader.js').then(m => new m.SkillLoader().listAll()).then(s => console.log(s.length))\""

# 5. CLI 工具
echo -e "\n${YELLOW}5. CLI 工具${NC}"
check "skills-cli.ts 存在" "[ -f scripts/skills-cli.ts ]"
check "package.json 包含 skills 命令" "grep -q 'skills:list' package.json"

# 6. 测试文件
echo -e "\n${YELLOW}6. 测试文件${NC}"
check "skill-loader.test.ts 存在" "[ -f src/services/skills/__tests__/skill-loader.test.ts ]"
check "skill-cache.test.ts 存在" "[ -f src/services/skills/__tests__/skill-cache.test.ts ]"

# 7. 迁移工具
echo -e "\n${YELLOW}7. 迁移工具${NC}"
check "migrate-prompts-to-skills.ts 存在" "[ -f scripts/migrate-prompts-to-skills.ts ]"
check "compare-prompts.ts 存在" "[ -f scripts/compare-prompts.ts ]"

# 8. API 路由
echo -e "\n${YELLOW}8. API 路由${NC}"
check "skills-test-routes.ts 存在" "[ -f src/routes/skills-test-routes.ts ]"
check "setup-routes.ts 包含 Skills 路由" "grep -q 'registerSkillsTestRoutes' src/app-setup/setup-routes.ts"

# 9. 文档
echo -e "\n${YELLOW}9. 文档${NC}"
check "skills/README.md 存在" "[ -f skills/README.md ]"
check "SKILLS_DEPLOYMENT.md 存在" "[ -f docs/SKILLS_DEPLOYMENT.md ]"
check "SKILLS_SYSTEM_SUMMARY.md 存在" "[ -f docs/SKILLS_SYSTEM_SUMMARY.md ]"

# 10. 环境配置
echo -e "\n${YELLOW}10. 环境配置${NC}"
check ".env 文件存在" "[ -f .env ]"

echo -e "\n${YELLOW}=== 验证结果 ===${NC}"
echo -e "通过: ${GREEN}${PASSED}${NC}"
echo -e "失败: ${RED}${FAILED}${NC}"

if [ $FAILED -eq 0 ]; then
  echo -e "\n${GREEN}✓ 系统已就绪，可以部署！${NC}"
  exit 0
else
  echo -e "\n${RED}✗ 发现问题，请修复后再部署${NC}"
  exit 1
fi
