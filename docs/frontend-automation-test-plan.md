# 内容喵平台 — 前端自动化测试流程

> 基于 Chrome DevTools MCP 的端到端自动化测试方案
> 生成日期：2026-04-03

---

## 一、项目功能模块全景

### 1.1 页面路由与组件映射

| 路由 | 页面组件 | 认证 | 核心功能 |
|------|---------|------|---------|
| `/login` | Login | 无 | 登录表单 |
| `/dashboard` | Square | 需要 | 创作广场、分类筛选、链接反推 |
| `/projects` | MyProjects | 需要 | 项目列表、筛选搜索、CRUD |
| `/reverse` | ReverseScript | 需要 | 脚本中心、搜索筛选、批量操作 |
| `/music` | MusicLibrary | 需要 | 音乐库、播放、匹配 |
| `/characters` | CharacterManagement | 需要 | 角色管理、5 视图生成 |
| `/assets` | AssetLibrary | 需要 | 资产库、上传、搜索 |
| `/create/step1` | Assets | 需要 | 服装上传/搭配推荐 |
| `/create/step2` | CharacterSelection | 需要 | 定妆/角色预览 |
| `/create/step3` | Step3WorkspaceRoute | 需要 | 脚本生成分镜 |
| `/create/step4` | Step4VideoWorkspaceRoute | 需要 | 视频生成 |
| `/create/step5` | Step5DeliveryShellRoute | 需要 | 成片交付/发布 |
| `/fission` | FissionScreen | 需要 | 视频裂变 |
| `/admin` | ReviewDashboard | 需要 | 管理后台总览 |
| `/admin/square-templates` | SquareTemplateManagement | 需要 | 模板管理 |
| `/admin/system-settings` | SystemSettings | 需要 | 系统参数 |
| `/admin/capability-lab` | CapabilityLab | 需要 | 能力实验室 |
| `/admin/video-merge` | VideoMerge | 需要 | 视频合并 |
| `/admin/video-music` | VideoMusicManagement | 需要 | 视频音乐管理 |
| `/image-create/step1` | ImageAssets | 需要 | 图片项目-服装上传 |
| `/image-create/step2` | ImageCharacterSelection | 需要 | 图片项目-定妆 |

### 1.2 状态管理（Zustand Store）

```
useAppStore
├── 认证状态: token, currentUser, adminToken
├── 侧边栏: sidebarCollapsed, hasNotification
├── 任务通知: taskNotifications[], activeToastNotificationId
├── 工作流: workflow (projectId, scriptId, selectedOutfitPlanId...)
├── 项目数据: projectData (uploads, outfits, scripts, clips...)
├── 主题: theme (currentTheme, availableThemes...)
├── 数据缓存: projects[], assets[], characters[]
└── 积分: credits, privateScriptIds
```

### 1.3 核心 6 步工作流

```
DRAFT → Step1(服装上传/搭配推荐) → Step2(定妆) → Step3(脚本生成分镜) → Step4(视频生成) → Step5(成片交付/发布)
```

### 1.4 后端 API 分组

| API 前缀 | 路由文件 | 说明 |
|----------|---------|------|
| `/auth/*` | auth-routes | 登录注册 |
| `/projects/*` | project-flow-routes, project-routes | 项目 CRUD + 6 步工作流 |
| `/library/*` | library-routes | 角色库/脚本库/资产库 |
| `/my-library/*` | library-routes | 用户私有库 |
| `/reverse/*` | reverse-square-routes | 反推解析 |
| `/admin/*` | admin-routes | 管理后台（用户/热榜/脚本/Provider/审计） |
| `/admin/providers/*` | admin-routes | LLM/图像/视频模型 Provider 管理 |
| `/admin/provider-policies/*` | admin-routes | Provider 路由策略 |
| `/admin/provider-audits` | admin-routes | 调用审计日志 |
| `/admin/scripts/hot-trends/*` | admin-routes | 热榜脚本管理 |
| `/fission/*` | fission-video-routes, fission-storyboard-routes | 视频裂变 |
| `/video-music/*` | video-music-routes | 音乐库 |
| `/square-templates/*` | square-template-routes | 广场模板 |
| `/themes/*` | theme-routes | 主题管理 |
| `/admin/prompts/*` | prompt-routes | Prompt 模板管理 |
| `/me/*` | user-routes | 用户信息/积分 |

---

## 二、自动化测试流程

### 2.1 环境准备

```
前置条件:
- 后端运行在 localhost:3020 (PERSISTENCE_REQUIRE_READY=false npm run dev)
- 前端运行在 localhost:3000 (npm --prefix apps/web run dev)
- Chrome DevTools MCP 已连接
- 测试账号: admin@example.com / admin123 (管理员)
- 普通用户账号: 需提前注册或使用已有账号
```

### 2.2 测试执行顺序

测试按依赖关系分层，共 5 层：

```
Layer 0: 基础设施 ─── 健康检查、页面加载
Layer 1: 认证流程 ─── 登录、登出、路由守卫
Layer 2: 独立页面 ─── 创作广场、项目列表、脚本中心、音乐库、角色管理、资产库
Layer 3: 核心工作流 ─── Step1→Step5 全流程、裂变
Layer 4: 管理后台 ─── 配置、用户管理、热榜、Provider、审计
Layer 5: 边界与回归 ─── 错误处理、并发、权限、Lighthouse 审计
```

---

## 三、Layer 0 — 基础设施测试

### T0-1 健康检查

```
操作:
  1. GET /health → 验证返回 200
  2. 打开 http://localhost:3000 → 页面可访问

验证:
  - 健康接口响应正常
  - 前端 HTML 返回，无白屏
```

### T0-2 静态资源加载

```
操作:
  1. 打开登录页，等待完整加载
  2. 检查 CSS/JS/图片是否 200（无 404）
  3. 检查 console 无 error 级别日志

验证:
  - 无 404 或 500 资源请求
  - 无 JS 运行时错误
```

---

## 四、Layer 1 — 认证流程测试

### T1-1 登录页渲染验证

```
操作:
  1. navigate_page → http://localhost:3000/login
  2. take_snapshot → 验证页面元素

验证:
  - 标题 "内容喵科技" 存在
  - 副标题 "AI内容创作平台" 存在
  - 邮箱输入框 (type=email) 存在且 required
  - 密码输入框 (type=password) 存在且 required
  - "进入控制台" 按钮存在
  - "记住设备" 复选框默认选中
  - 底部版权信息 "© 2026-现在" 存在
  - ICP 备案链接存在
```

### T1-2 空表单提交验证

```
操作:
  1. 不填写任何字段
  2. 点击 "进入控制台" 按钮

验证:
  - 浏览器原生 required 校验触发
  - 页面未跳转，仍在 /login
```

### T1-3 错误凭据登录

```
操作:
  1. 填写邮箱 wrong@example.com
  2. 填写密码 wrongpassword
  3. 点击 "进入控制台"

验证:
  - 页面显示错误提示（toast 或内联消息）
  - 仍在 /login 页面
  - 输入框内容保留
```

### T1-4 管理员登录成功

```
操作:
  1. 填写邮箱 admin@example.com
  2. 填写密码 admin123
  3. 点击 "进入控制台"
  4. wait_for ["创作广场", "项目", "Dashboard"]

验证:
  - 成功跳转到 /dashboard
  - URL 为 http://localhost:3000/dashboard
  - 侧边栏可见，包含所有导航项:
    · 创作广场、我的项目、脚本中心、音乐库、角色管理、资产库
    · 管理后台、模板管理、系统参数、能力实验室、视频合并、视频音乐
  - 顶部标题为 "创作广场"
  - localStorage 中存在 vogue_ai_token 和 vogue_ai_user
```

### T1-5 路由守卫 — 未登录访问受保护页面

```
操作:
  1. 执行 logout（清除 localStorage 或调用退出登录）
  2. navigate_page → http://localhost:3000/dashboard

验证:
  - 自动重定向到 /login
  - 其他受保护路由同理:
    /projects, /reverse, /music, /characters, /assets,
    /create/step1, /admin, /fission
```

### T1-6 退出登录

```
操作:
  1. 先完成管理员登录
  2. 点击侧边栏底部 "退出登录" 按钮
  3. wait_for ["登录", "工作邮箱"]

验证:
  - 跳转到 /login
  - localStorage 中 vogue_ai_token 已清除
  - vogue_ai_user 已清除
  - 侧边栏不可见
```

---

## 五、Layer 2 — 独立页面功能测试

### T2-1 创作广场（Dashboard）

```
前置: 已登录管理员

操作:
  1. 导航到 /dashboard
  2. 验证分类标签: "热门推荐", "男装", "女装", "男童装", "女童装"
  3. 点击 "女装" 标签 → 验证内容切换
  4. 点击 "热门推荐" → 返回默认
  5. 验证搜索框存在
  6. 验证链接输入框存在 + "一键复刻" 按钮
  7. 验证广场卡片列表（图片、标题、作者、播放量、点赞数）
  8. 点击某个卡片 → 验证视频播放弹窗或详情展开
  9. 验证 "创建视频" 按钮存在

验证:
  - 分类切换后内容更新
  - 卡片完整显示：封面图、分类标签、文案、作者、播放量、点赞
  - 视频播放弹窗正常弹出
```

### T2-2 创作广场 — 链接反推

```
操作:
  1. 在链接输入框粘贴抖音链接（如 https://v.douyin.com/xxxxx）
  2. 点击 "一键复刻"
  3. wait_for ["解析", "反推", "loading"]

验证:
  - 触发反推解析请求
  - 显示加载状态
  - （如果链接有效）显示解析结果
```

### T2-3 我的项目列表

```
操作:
  1. 点击侧边栏 "我的项目"
  2. 验证 URL 为 /projects
  3. 验证页面标题 "我的项目"
  4. 验证筛选按钮: "图片项目", "视频项目", "全部", "最新完成", "已完成", "生成中", "草稿"
  5. 验证搜索框存在
  6. 验证项目卡片列表:
     - 封面图
     - 项目名称
     - 状态标签（草稿/已完成等）
     - 项目类型（视频项目/图片项目）
     - 项目 ID
     - 时长和比例
     - 创建时间
     - "继续编辑" 按钮
     - "裂变" 按钮（视频项目）
     - "删除" 按钮
  7. 点击 "草稿" 筛选 → 验证只显示草稿项目
  8. 点击 "视频项目" → 验证只显示视频项目

验证:
  - 筛选切换正常
  - 项目卡片信息完整
  - 状态标签颜色正确
```

### T2-4 我的项目 — 搜索

```
操作:
  1. 在搜索框输入 "2026/4/2"
  2. 验证结果列表实时过滤
  3. 清空搜索框 → 恢复完整列表

验证:
  - 搜索结果按名称过滤
  - 清空后恢复
```

### T2-5 我的项目 — 删除项目

```
操作:
  1. 点击某个项目的 "删除" 按钮
  2. 验证出现确认对话框
  3. 确认删除
  4. wait_for 项目消失

验证:
  - 确认对话框弹出
  - 删除后项目从列表消失
  - console 无错误
```

### T2-6 脚本中心

```
操作:
  1. 导航到 /reverse
  2. 验证标题 "脚本中心"
  3. 验证 "我的脚本库 (N)" 计数显示
  4. 验证搜索框存在
  5. 验证时间筛选下拉: "全部时间", "最近4小时", "最近12小时", "最近24小时", "最近7天"
  6. 验证标签筛选下拉: "全部标签", "#反推脚本", "#文件反推", "#脚本中心"
  7. 验证批量操作: "全选当前", "清空勾选", "批量删除"
  8. 验证脚本卡片:
     - 标题
     - 内容摘要
     - 版本号
     - 更新日期
     - 标签列表
     - "查看内容" 按钮
     - "删除" 按钮
  9. 点击 "查看内容" → 验证内容展开/弹窗
  10. 选择时间 "最近24小时" → 验证过滤生效

验证:
  - 搜索和筛选组合正常
  - 脚本内容查看正常
  - 批量勾选后 "批量删除" 按钮激活
```

### T2-7 音乐库

```
操作:
  1. 导航到 /music
  2. 验证音乐列表加载
  3. 验证搜索/筛选功能
  4. 点击播放按钮 → 验证音频播放
  5. 验证 "匹配" 或 "氛围分析" 功能入口

验证:
  - 音乐列表正常渲染
  - 音频可播放
```

### T2-8 角色管理

```
操作:
  1. 导航到 /characters
  2. 验证角色列表/卡片展示
  3. 点击 "新建角色" → 验证创建表单/弹窗
  4. 验证已有角色的操作:
     - 编辑
     - 5 视图生成（正面/侧面/背面/角度/特写）
     - 删除

验证:
  - 角色列表正常渲染
  - 创建表单字段完整
  - 5 视图状态可见
```

### T2-9 资产库

```
操作:
  1. 导航到 /assets
  2. 验证资产列表展示
  3. 点击 "上传" → 验证文件选择器
  4. 验证资产类型筛选
  5. 验证搜索功能
  6. 点击资产 → 验证预览/详情
  7. 点击删除 → 验证确认和删除

验证:
  - 资产列表完整
  - 上传功能可用
  - 预览和删除正常
```

---

## 六、Layer 3 — 核心 6 步工作流测试

### T3-1 创建新项目

```
操作:
  1. 点击侧边栏 "新建项目" 按钮（+ 图标）
  2. 验证项目创建对话框/页面
  3. 选择项目类型（视频项目）
  4. 确认创建
  5. wait_for ["Step1", "上传", "create/step1"]

验证:
  - 项目创建成功
  - 自动跳转到 /create/step1
  - URL 包含项目 ID
  - 侧边栏步骤指示器显示 Step1 高亮
```

### T3-2 Step1 — 服装上传与搭配推荐

```
操作:
  1. 在 Step1 页面验证上传区域:
     - 上衣(top)上传区
     - 下装(bottom)上传区
     - 鞋子(shoes)上传区
     - 配饰(acc)上传区
  2. 上传一张服装图片（上衣）
  3. 验证图片预览显示
  4. 点击 "搭配推荐" 或 "生成" 按钮
  5. wait_for ["搭配", "推荐", "outfit"]
  6. 验证搭配方案列表展示
  7. 选择一个搭配方案
  8. 验证 "下一步" 按钮激活

验证:
  - 图片上传后显示预览
  - 搭配推荐异步加载（有 loading 状态）
  - 推荐结果可交互选择
  - 选择后可进入 Step2
```

### T3-3 Step2 — 定妆/角色预览

```
操作:
  1. 点击 "下一步" 进入 Step2
  2. 验证角色预览区域
  3. 验证角色 5 视图（正面/侧面/背面/角度/特写）
  4. 如果有角色库，验证可从库中选择
  5. 确认角色选择
  6. 验证 "下一步" 按钮激活

验证:
  - 角色预览正常显示
  - 5 视图可切换查看
  - 确认后状态更新
```

### T3-4 Step3 — 脚本生成与分镜

```
操作:
  1. 进入 Step3
  2. 验证脚本编辑器区域
  3. 验证候选脚本快照面板 (Candidate Strip)
  4. 点击 "生成脚本" 按钮
  5. wait_for 脚本内容加载
  6. 验证脚本内容渲染
  7. 验证分镜卡片列表:
     - 每帧有提示词
     - 每帧有参考图
     - 可编辑/优化提示词
  8. 点击 "生成分镜图" 按钮
  9. wait_for 分镜图生成
  10. 验证分镜图展示
  11. 点击 "下一步"

验证:
  - 脚本编辑器可编辑
  - 候选快照加载（SSE 流式）
  - 分镜卡片完整（提示词+参考图）
  - 分镜图异步生成有进度反馈
```

### T3-5 Step4 — 视频生成

```
操作:
  1. 进入 Step4
  2. 验证视频预览区域
  3. 验证视频配置面板（分辨率、比例、清晰度等）
  4. 点击 "生成视频" 按钮
  5. 验证视频生成进度（clipStatuses）
  6. wait_for 视频生成完成
  7. 验证视频预览可播放
  8. 点击 "下一步"

验证:
  - 配置面板正常展示
  - 视频生成有进度指示（per-clip）
  - 生成完成后可预览
```

### T3-6 Step5 — 成片交付与发布

```
操作:
  1. 进入 Step5
  2. 验证成片预览
  3. 验证抖音发布面板（如果配置了）
  4. 验证导出按钮
  5. 验证音乐只读面板

验证:
  - 成片可预览
  - 发布流程入口可用
  - 导出功能可触发
```

### T3-7 视频裂变

```
操作:
  1. 从项目列表点击某项目的 "裂变" 按钮
  2. 或直接导航到 /fission?projectId=xxx
  3. 验证裂变页面加载
  4. 验证分镜选择
  5. 验证裂变模式选择（重组/镜像）
  6. 点击生成
  7. 验证裂变结果展示

验证:
  - 裂变页面正常加载
  - 可选择分镜和模式
  - 生成结果展示
```

---

## 七、Layer 4 — 管理后台测试

### T4-1 管理后台总览（ReviewDashboard）

```
操作:
  1. 导航到 /admin
  2. 验证页面标题 "管理后台"
  3. 验证功能入口按钮:
     - "API 配置"
     - "积分审计"
     - "脚本管理"
     - "热榜资产管理"
     - "用户管理"
     - "内容审核(0)"
  4. 验证 API 配置区域:
     - 反推 Stage 顺序输入框
     - 外部 API 顺序输入框
     - 视频/实时热搜 API URL 输入框
     - Token 输入框
     - TopN 生成数量
     - Prompt 模板（before/after）
     - "保存抖音 API 配置" 按钮
  5. 验证 LLM 配置区域:
     - 模型列表（配置名称、vendor、endpoint、模型 ID）
     - 路由策略下拉（脚本生成、反推、Step1、热榜打标签）
     - "保存路由" 按钮
  6. 验证图像模型配置区域
  7. 验证视频模型配置区域
  8. 验证调用审计表格:
     - 功能来源、模型、触发时间、成功与否、耗时
     - 筛选下拉（来源、模型、状态）

验证:
  - 所有配置表单预填当前值
  - 下拉选择器可切换
  - 审计表格有数据
  - 无 console 错误
```

### T4-2 用户管理

```
操作:
  1. 在管理后台点击 "用户管理" 按钮
  2. 验证用户列表表格:
     - 邮箱、角色、创建时间、状态
  3. 点击 "新增用户" → 验证创建表单
  4. 测试搜索用户
  5. 测试用户状态切换（锁定/解锁）

验证:
  - 用户列表正常渲染
  - 搜索和状态操作正常
```

### T4-3 热榜资产管理

```
操作:
  1. 点击 "热榜资产管理" 按钮
  2. 验证热榜脚本列表
  3. 点击 "同步" → 验证同步请求发出
  4. 验证脚本的 CRUD 操作
  5. 验证 "反推到智能分镜" 功能
  6. 验证批量操作

验证:
  - 热榜列表正常展示
  - 同步触发后列表更新
  - 批量操作可用
```

### T4-4 Provider 连通性测试

```
操作:
  1. 在管理后台找到已配置的 Provider
  2. 点击 "联通测试" 按钮
  3. wait_for 测试结果

验证:
  - 显示连通性测试结果（成功/失败）
  - 结果出现在审计表格中
```

### T4-5 模板管理

```
操作:
  1. 导航到 /admin/square-templates
  2. 验证模板列表展示
  3. 点击 "新建模板"
  4. 填写模板表单
  5. 上传封面图
  6. 保存

验证:
  - 模板列表正常
  - 创建/编辑流程完整
```

### T4-6 系统参数

```
操作:
  1. 导航到 /admin/system-settings
  2. 验证系统设置面板加载
  3. 验证角色工作流配置区域
  4. 修改参数并保存

验证:
  - 设置面板正常展示
  - 保存操作生效
```

### T4-7 能力实验室

```
操作:
  1. 导航到 /admin/capability-lab
  2. 验证功能入口:
     - LLM 文本生成
     - 图像分析
     - 图像生成
     - 视频生成
     - 反推分镜库
  3. 选择 "LLM 文本生成"
  4. 输入测试 prompt
  5. 点击生成
  6. wait_for 结果

验证:
  - 实验室面板正常加载
  - 各功能入口可切换
  - 调用有 loading → 结果展示
```

### T4-8 视频合并

```
操作:
  1. 导航到 /admin/video-merge
  2. 验证视频合并界面
  3. 上传/选择多个视频片段
  4. 调整顺序
  5. 点击合并

验证:
  - 合并界面正常
  - 视频片段可选择
  - 合并操作可触发
```

### T4-9 视频音乐管理

```
操作:
  1. 导航到 /admin/video-music
  2. 验证音乐管理界面
  3. 测试同步功能
  4. 测试上传音乐
  5. 测试删除音乐

验证:
  - 音乐列表正常
  - 同步和上传可用
```

---

## 八、Layer 5 — 边界与回归测试

### T5-1 表单输入边界

```
场景:
  a. 登录邮箱格式无效 → 验证浏览器原生校验
  b. 密码为空 → required 校验
  c. 搜索框输入超长文本 → 无崩溃
  d. 配置表单输入特殊字符 → 正常处理
```

### T5-2 网络异常处理

```
场景:
  a. 停止后端 → 操作前端各页面 → 验证错误提示而非白屏
  b. API 超时 → 验证超时提示
  c. 401 响应 → 验证自动跳转登录页
```

### T5-3 侧边栏导航完整性

```
操作:
  依次点击每个侧边栏导航项，验证:
  1. 创作广场 → /dashboard ✓
  2. 我的项目 → /projects ✓
  3. 脚本中心 → /reverse ✓
  4. 音乐库 → /music ✓
  5. 角色管理 → /characters ✓
  6. 资产库 → /assets ✓
  7. 管理后台 → /admin ✓
  8. 模板管理 → /admin/square-templates ✓
  9. 系统参数 → /admin/system-settings ✓
  10. 能力实验室 → /admin/capability-lab ✓
  11. 视频合并 → /admin/video-merge ✓
  12. 视频音乐 → /admin/video-music ✓

验证:
  - 每次导航后 URL 正确
  - 页面无 console 错误
  - 返回无崩溃
```

### T5-4 主题切换

```
操作:
  1. 点击顶部 "palette" 主题设置按钮
  2. 切换主题（如 dark/light）
  3. 验证页面主题变化
  4. 刷新页面 → 验证主题持久化

验证:
  - 主题切换即时生效
  - 刷新后主题保持
```

### T5-5 响应式布局

```
操作:
  1. resize_page 到 1920x1080 → 验证桌面布局
  2. resize_page 到 1366x768 → 验证笔记本布局
  3. resize_page 到 375x812 → 验证移动端布局

验证:
  - 侧边栏在移动端自动折叠
  - 内容区域自适应
  - 无水平溢出滚动条
```

### T5-6 Lighthouse 审计

```
操作:
  对每个主要页面运行 lighthouse_audit:
  1. /login (snapshot)
  2. /dashboard (snapshot)
  3. /projects (snapshot)
  4. /admin (snapshot)

验证:
  - Accessibility ≥ 90
  - Best Practices ≥ 95
  - 无 console 错误
  - 关注已知问题:
    · color-contrast 对比度
    · meta-description 缺失
    · robots.txt 缺失
```

### T5-7 并发操作

```
场景:
  a. 快速连续切换多个页面 → 无状态错乱
  b. 快速连续点击筛选按钮 → 最终状态正确
  c. 多个异步操作同时进行 → loading 状态正确
```

### T5-8 权限验证

```
场景:
  a. 普通用户登录 → 管理后台菜单应隐藏或不可访问
  b. 未登录访问 → 全部重定向到 /login
  c. Admin 功能入口仅 admin 角色可见
```

---

## 九、测试结果记录模板

### 每个用例的记录格式

```markdown
### T{id}-{name}
- **状态**: PASS / FAIL / SKIP
- **耗时**: Xs
- **截图**: path/to/screenshot.png
- **Console 错误**: 无 / [错误列表]
- **备注**: [补充说明]
```

### 汇总报告格式

```markdown
## 测试汇总

| 分层 | 用例数 | 通过 | 失败 | 跳过 | 通过率 |
|------|--------|------|------|------|--------|
| L0 基础设施 | 2 | | | | |
| L1 认证流程 | 6 | | | | |
| L2 独立页面 | 9 | | | | |
| L3 核心工作流 | 7 | | | | |
| L4 管理后台 | 9 | | | | |
| L5 边界回归 | 8 | | | | |
| **合计** | **41** | | | | |

### 失败用例明细
[列表]

### Lighthouse 审计
| 页面 | Accessibility | Best Practices | SEO |
|------|-------------|----------------|-----|
| /login | | | |
| /dashboard | | | |
| /projects | | | |
| /admin | | | |
```

---

## 十、已知问题与关注点

| # | 页面 | 问题 | 严重度 | Lighthouse Audit |
|---|------|------|--------|-----------------|
| 1 | 全局 | 缺少 meta description | 中 | seo:meta-description |
| 2 | 全局 | robots.txt 无效 | 中 | seo:robots-txt |
| 3 | 管理后台 | 部分文字颜色对比度不足 | 低 | accessibility:color-contrast |
| 4 | 项目列表 | 部分 Project 预览图为 placehold.co 占位图 | 低 | 视觉一致性 |

---

## 十一、自动化脚本示例

以下是 Chrome DevTools MCP 的自动化测试脚本示例：

### 登录并截图流程

```
# 1. 打开登录页
navigate_page → http://localhost:3000/login

# 2. 填写表单
fill_form → [
  { uid: "email_input", value: "admin@example.com" },
  { uid: "password_input", value: "admin123" }
]

# 3. 提交
click → submit_button

# 4. 等待跳转
wait_for → ["创作广场", "项目"], timeout: 5000

# 5. 截图
take_screenshot → dashboard_loaded.png

# 6. 验证 console 无错误
list_console_messages → types: ["error"]
```

### 批量页面冒烟测试

```
pages = ["/dashboard", "/projects", "/reverse", "/music", "/characters", "/assets", "/admin"]
for page in pages:
    navigate_page → http://localhost:3000 + page
    wait_for → 任意文本, timeout: 5000
    errors = list_console_messages → types: ["error"]
    screenshot → page.replace("/", "_") + ".png"
    record(page, errors.length == 0, errors)
```
