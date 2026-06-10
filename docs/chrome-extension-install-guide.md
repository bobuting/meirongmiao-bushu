# Chrome 扩展一键安装方案

## 当前状态

❌ **不支持一键安装** — 需要手动加载扩展（开发者模式）

---

## 方案对比

| 方案 | 用户体验 | 实现难度 | 成本 | 推荐度 |
|------|---------|---------|------|--------|
| **Chrome Web Store** | ⭐⭐⭐⭐⭐ 一键安装 | 中等（审核 1-3天） | $5（一次性） | ⭐⭐⭐⭐⭐ 推荐 |
| **开发者模式加载** | ⭐⭐ 手动 5 步 | 简单 | 免费 | ⭐⭐ 当前方案 |
| **企业策略推送** | ⭐⭐⭐⭐ 自动安装 | 高（企业环境） | 无 | ⭐ 不适用 |

---

## 方案 1：发布到 Chrome Web Store（推荐）

### 准备工作

```bash
# 1. 构建扩展
cd apps/douyin-publisher-extension
npm install
npm run build

# 2. 打包 ZIP
cd dist
zip -r ../extension.zip .

# 3. 验证 manifest.json
cat manifest.json | grep "name\|version\|key"
```

### 发布流程

1. **注册开发者账号**
   ```
   https://chrome.google.com/webstore/devconsole
   ```
   - 使用 Google 账号登录
   - 支付 $5 注册费（一次性）
   - 填写开发者信息

2. **上传扩展**
   - 点击「新增项目」
   - 上传 `extension.zip`
   - 填写商店详情：

   | 字段 | 内容 |
   |------|------|
   | 名称 | 内容喵 · 抖音发布助手 |
   | 简介 | 自动发布短视频到抖音创作者后台 |
   | 详细描述 | 功能：多账号管理、Cookie 隠离、反检测策略、实时进度反馈 |
   | 分类 | 生产力工具 |
   | 语言 | 中文（简体） |

3. **提交审核**
   - 审核周期：1-3 天
   - 审核内容：代码安全、隐私合规、功能描述准确性

4. **审核通过后**
   - 用户访问商店链接一键安装
   - 扩展 ID 固定：`chrome-extension://[固定ID]/`

### 商店详情模板

```
名称：
内容喵 · 抖音发布助手

简介：
通过 Chrome 扩展自动化发布短视频到抖音创作者后台，支持多账号管理。

详细描述：
【功能特性】
✅ 多抖音账号管理，Cookie 隔离
✅ 用户真实 IP + 真实浏览器指纹，风控风险低
✅ 与服务端自动化完全隔离，独立数据库表
✅ 实时进度反馈，发布状态实时同步
✅ 反检测策略：随机延时、逐字输入、鼠标轨迹模拟

【使用流程】
1. 安装扩展后点击图标 → 管理账号 & 设置
2. 添加抖音账号（扫码或密码登录）
3. 在内容喵平台 Step5 页面点击「发布到抖音」
4. 扩展自动执行发布，前端实时显示进度

【安全说明】
- Cookie 存储在用户本地浏览器，不上传到服务器
- 使用用户真实 IP 和浏览器指纹，降低封号风险
- 所有操作在用户浏览器端执行，服务端仅做任务调度

【适用场景】
- 电商短视频创作者
- 个人账号发布（非批量自动化）
- 需要降低封号风险的用户

分类：生产力工具
语言：中文（简体）
隐私政策：https://neirongmiao.com/privacy
```

---

## 方案 2：简化当前安装流程（临时）

### 使用安装辅助脚本

```bash
# macOS / Linux
./scripts/install-chrome-extension.sh

# 输出：
# ✅ 扩展目录：/path/to/dist
# 📱 正在打开 Chrome 扩展管理页面...
# ==========================================
# 请按以下步骤操作：
# 1. ✅ 启用右上角「开发者模式」开关
# 2. ✅ 点击「加载已解压的扩展」按钮
# 3. ✅ 在文件选择器中粘贴路径
# 4. ✅ 点击「选择」完成安装
# ==========================================
```

### 手动安装步骤（简化版）

```
1. 打开 chrome://extensions（脚本自动打开）
2. 启用「开发者模式」（右上角）
3. 点击「加载已解压的扩展」
4. 选择目录：apps/douyin-publisher-extension/dist
5. 确认显示「内容喵 · 抖音发布助手」
```

---

## 技术限制说明

### 为什么不支持网页点击安装？

Chrome 在 2018 年移除了 `chrome.webstore.install()` API，原因是：
- 安全风险：恶意网站可强制安装扩展
- 用户体验：用户不知情下被安装扩展
- 替代方案：只能通过 Chrome Web Store 安装

### 内联安装（Inline Install）已废弃

```javascript
// ❌ 已废弃，Chrome 会拦截
chrome.webstore.install(
  'https://chrome.google.com/webstore/detail/xxx',
  function() { console.log('安装成功'); }
);
```

### 开发者模式限制

- ✅ 免费使用
- ✅ 快速测试
- ❌ 每次启动 Chrome 提示"禁用开发者模式扩展"
- ❌ 扩展 ID 不固定（每次加载可能变化）
- ❌ 无法自动更新

---

## 推荐方案

### 长期方案：Chrome Web Store

**优先级：⭐⭐⭐⭐⭐**

优势：
- 用户一键安装
- 自动更新
- 官方可信
- 扩展 ID 固定（便于 API 调用）

### 短期方案：安装脚本辅助

**优先级：⭐⭐⭐**

优势：
- 减少手动操作
- 自动打开 Chrome 扩展页面
- 提供清晰的操作指引

---

## 下一步行动

1. **决策：是否发布到 Chrome Web Store**
   - 需要注册开发者账号（$5）
   - 审核周期 1-3 天
   - 长期维护（更新需重新审核）

2. **临时方案：使用安装脚本**
   ```bash
   ./scripts/install-chrome-extension.sh
   ```

3. **优化扩展图标**
   - 当前图标为占位图标（95B）
   - 需要设计品牌图标：16x16、48x48、128x128

---

## 参考文档

- Chrome Web Store Developer Dashboard: https://chrome.google.com/webstore/devconsole
- Chrome Extension 发布指南: https://developer.chrome.com/docs/webstore/publish/
- 扩展详细文档: [ext-douyin-publisher.md](ext-douyin-publisher.md)