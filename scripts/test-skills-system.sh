#!/bin/bash

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

TESTS_PASSED=0
TESTS_FAILED=0

test_command() {
  local name=$1
  local command=$2
  echo -n "测试: $name ... "
  if eval "$command" > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC}"
    ((TESTS_PASSED++))
  else
    echo -e "${RED}✗${NC}"
    ((TESTS_FAILED++))
    echo "  命令: $command"
  fi
}

echo -e "${YELLOW}=== Skills 系统测试 ===${NC}\n"

# 1. CLI 工具测试
echo -e "${YELLOW}1. CLI 工具测试${NC}"
test_command "列出所有 Skills" "npm run skills:list"
test_command "查看 Skill 详情" "npm run skills:info script-generation"
test_command "验证 Skill" "npm run skills:validate script-generation"

# 2. 单元测试
echo -e "\n${YELLOW}2. 单元测试${NC}"
test_command "SkillLoader 测试" "npm run test -- skill-loader.test.ts"
test_command "SkillCache 测试" "npm run test -- skill-cache.test.ts"

# 3. 集成测试
echo -e "\n${YELLOW}3. 集成测试${NC}"
test_command "加载所有 Skills" "node -e \"import('./dist/services/skills/skill-loader.js').then(m => new m.SkillLoader().listAll())\""
test_command "渲染测试" "node -e \"import('./dist/services/skills/skill-loader.js').then(m => { const loader = new m.SkillLoader(); return loader.load('script-generation').then(s => s.render({script: 'test'})); })\""

# 4. API 端点测试（需要服务运行）
echo -e "\n${YELLOW}4. API 端点测试（需要服务运行）${NC}"
if curl -s http://localhost:3020/health > /dev/null 2>&1; then
  test_command "GET /skills-test" "curl -s http://localhost:3020/neirongmiao/api/skills-test | grep -q success"
  test_command "GET /skills-test/:code" "curl -s http://localhost:3020/neirongmiao/api/skills-test/script-generation | grep -q success"
  test_command "POST /skills-test/:code/render" "curl -s -X POST http://localhost:3020/neirongmiao/api/skills-test/script-generation/render -H 'Content-Type: application/json' -d '{\"variables\":{\"script\":\"test\"}}' | grep -q success"
else
  echo -e "${YELLOW}  服务未运行，跳过 API 测试${NC}"
fi

echo -e "\n${YELLOW}=== 测试结果 ===${NC}"
echo -e "通过: ${GREEN}${TESTS_PASSED}${NC}"
echo -e "失败: ${RED}${TESTS_FAILED}${NC}"

if [ $TESTS_FAILED -eq 0 ]; then
  echo -e "\n${GREEN}✓ 所有测试通过！${NC}"
  exit 0
else
  echo -e "\n${RED}✗ 部分测试失败${NC}"
  exit 1
fi
