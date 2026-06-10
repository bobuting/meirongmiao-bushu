# 视频项目用户操作指南 HTML 文档实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 创建两份独立的 HTML 用户操作指南文档（流程指南版 + 常见问题版），帮助电商商家理解视频项目完整流程。

**架构：** 两个独立的 HTML 文件，内嵌 CSS 样式，无外部依赖，响应式设计，存放在 `public/user-guide/` 目录下。

**技术栈：** HTML5 + CSS3（内嵌），无 JavaScript，纯静态文件。

---

## 文件结构

```
public/user-guide/
├── video-project-guide.html    # 方案 A：流程指南版
└── video-project-faq.html      # 方案 C：常见问题版
```

| 文件 | 职责 |
|------|------|
| `video-project-guide.html` | 按项目流程阶段组织的操作指南，包含清单和案例 |
| `video-project-faq.html` | 按常见问题组织的操作指南，问答形式 |

---

## 任务 1：创建目录结构

**文件：**
- 创建：`public/user-guide/` 目录

- [ ] **步骤 1：创建 user-guide 目录**

运行：`mkdir -p public/user-guide`
预期：目录创建成功

---

## 任务 2：创建流程指南版 HTML 文件

**文件：**
- 创建：`public/user-guide/video-project-guide.html`

- [ ] **步骤 1：创建 HTML 文件骨架和头部**

创建 `public/user-guide/video-project-guide.html`，包含：
- DOCTYPE 和 html 标签
- head 部分：meta 标签、标题、内嵌 CSS 样式
- body 开始标签

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="内容喵视频项目操作指南 - 从服装到成片的完整流程，帮助电商商家快速上手。">
  <title>视频项目操作指南 - 内容喵</title>
  <style>
    /* 全局样式 */
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
      background-color: #fdfbf7;
      color: #333333;
      line-height: 1.8;
      font-size: 16px;
    }
    
    /* 配色变量 */
    :root {
      --primary: #e68c19;
      --primary-light: #f5a623;
      --bg-light: #fdfbf7;
      --bg-card: #ffffff;
      --text-dark: #333333;
      --text-light: #666666;
      --success: #22c55e;
      --warning: #ef4444;
      --border: #e5e5e5;
    }
    
    /* 容器 */
    .container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px;
    }
    
    /* 页面头部 */
    .page-header {
      background: linear-gradient(135deg, var(--primary) 0%, var(--primary-light) 100%);
      color: white;
      padding: 60px 20px;
      text-align: center;
    }
    
    .page-header h1 {
      font-size: 32px;
      font-weight: 700;
      margin-bottom: 16px;
    }
    
    .page-header p {
      font-size: 18px;
      opacity: 0.95;
      max-width: 600px;
      margin: 0 auto;
    }
    
    /* 警告横幅 */
    .warning-banner {
      background: #fef2f2;
      border: 2px solid var(--warning);
      border-radius: 12px;
      padding: 20px;
      margin: 30px auto;
      max-width: 800px;
      display: flex;
      align-items: flex-start;
      gap: 16px;
    }
    
    .warning-banner .icon {
      font-size: 24px;
      flex-shrink: 0;
    }
    
    .warning-banner p {
      color: #991b1b;
      font-weight: 500;
    }
    
    /* 主内容区 */
    .main-content {
      display: flex;
      gap: 40px;
      margin-top: 40px;
    }
    
    /* 侧边目录 */
    .sidebar {
      width: 280px;
      flex-shrink: 0;
      position: sticky;
      top: 20px;
      height: fit-content;
    }
    
    .sidebar h3 {
      font-size: 16px;
      color: var(--text-light);
      margin-bottom: 16px;
      padding-bottom: 12px;
      border-bottom: 2px solid var(--border);
    }
    
    .sidebar nav a {
      display: block;
      padding: 10px 16px;
      color: var(--text-dark);
      text-decoration: none;
      border-radius: 8px;
      margin-bottom: 4px;
      transition: all 0.2s;
    }
    
    .sidebar nav a:hover {
      background: #fef3e2;
      color: var(--primary);
    }
    
    /* 内容区 */
    .content {
      flex: 1;
      min-width: 0;
    }
    
    /* 章节 */
    .chapter {
      margin-bottom: 60px;
    }
    
    .chapter-header {
      display: flex;
      align-items: center;
      gap: 16px;
      margin-bottom: 24px;
    }
    
    .chapter-number {
      width: 48px;
      height: 48px;
      background: var(--primary);
      color: white;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
      font-weight: 700;
    }
    
    .chapter-title {
      font-size: 24px;
      font-weight: 700;
      color: var(--text-dark);
    }
    
    .chapter-desc {
      color: var(--text-light);
      margin-top: 4px;
    }
    
    /* 小节 */
    .section {
      margin-bottom: 32px;
    }
    
    .section h3 {
      font-size: 18px;
      font-weight: 600;
      color: var(--text-dark);
      margin-bottom: 16px;
      padding-left: 12px;
      border-left: 4px solid var(--primary);
    }
    
    /* 清单样式 */
    .checklist {
      background: var(--bg-card);
      border: 2px solid var(--border);
      border-radius: 12px;
      padding: 20px;
    }
    
    .checklist-item {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 12px 0;
      border-bottom: 1px solid #f0f0f0;
    }
    
    .checklist-item:last-child {
      border-bottom: none;
    }
    
    .checklist-item .checkbox {
      width: 22px;
      height: 22px;
      border: 2px solid var(--primary);
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      color: var(--primary);
      font-size: 14px;
    }
    
    .checklist-item .text {
      flex: 1;
    }
    
    .checklist-item .text strong {
      color: var(--text-dark);
    }
    
    .checklist-item .text span {
      color: var(--text-light);
      font-size: 14px;
    }
    
    /* 表格样式 */
    .table-wrapper {
      overflow-x: auto;
      margin: 20px 0;
    }
    
    table {
      width: 100%;
      border-collapse: collapse;
      background: var(--bg-card);
      border-radius: 12px;
      overflow: hidden;
    }
    
    th {
      background: var(--primary);
      color: white;
      padding: 14px 16px;
      text-align: left;
      font-weight: 600;
    }
    
    td {
      padding: 14px 16px;
      border-bottom: 1px solid var(--border);
    }
    
    tr:last-child td {
      border-bottom: none;
    }
    
    tr:nth-child(even) {
      background: #fafafa;
    }
    
    /* 案例卡片 */
    .case-card {
      background: linear-gradient(135deg, #fef9f3 0%, #fff5eb 100%);
      border: 2px solid var(--primary-light);
      border-radius: 16px;
      padding: 24px;
      margin: 24px 0;
    }
    
    .case-card .case-header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 16px;
    }
    
    .case-card .case-icon {
      font-size: 28px;
    }
    
    .case-card .case-title {
      font-size: 18px;
      font-weight: 600;
      color: var(--primary);
    }
    
    .case-card .case-content {
      color: var(--text-dark);
    }
    
    /* 警告框 */
    .alert {
      background: #fef2f2;
      border-left: 4px solid var(--warning);
      padding: 16px 20px;
      border-radius: 0 8px 8px 0;
      margin: 20px 0;
    }
    
    .alert-warning {
      color: #991b1b;
    }
    
    /* 成功提示 */
    .tip {
      background: #f0fdf4;
      border-left: 4px solid var(--success);
      padding: 16px 20px;
      border-radius: 0 8px 8px 0;
      margin: 20px 0;
    }
    
    .tip p {
      color: #166534;
    }
    
    /* 进度指示器 */
    .progress-indicator {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 20px;
      background: #f5f5f5;
      border-radius: 20px;
      margin-bottom: 24px;
      width: fit-content;
    }
    
    .progress-indicator .step {
      color: var(--text-light);
      font-size: 14px;
    }
    
    .progress-indicator .current {
      color: var(--primary);
      font-weight: 600;
    }
    
    /* 页脚 */
    .page-footer {
      text-align: center;
      padding: 40px 20px;
      border-top: 1px solid var(--border);
      margin-top: 60px;
      color: var(--text-light);
    }
    
    .page-footer a {
      color: var(--primary);
      text-decoration: none;
    }
    
    /* 响应式设计 */
    @media (max-width: 1024px) {
      .main-content {
        flex-direction: column;
      }
      
      .sidebar {
        width: 100%;
        position: static;
        background: var(--bg-card);
        padding: 20px;
        border-radius: 12px;
        margin-bottom: 30px;
      }
      
      .sidebar nav {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      
      .sidebar nav a {
        padding: 8px 16px;
        font-size: 14px;
      }
    }
    
    @media (max-width: 768px) {
      .page-header {
        padding: 40px 20px;
      }
      
      .page-header h1 {
        font-size: 24px;
      }
      
      .page-header p {
        font-size: 16px;
      }
      
      .chapter-title {
        font-size: 20px;
      }
      
      .warning-banner {
        flex-direction: column;
        text-align: center;
      }
    }
    
    /* 打印样式 */
    @media print {
      .sidebar {
        display: none;
      }
      
      .page-header {
        background: none;
        color: var(--text-dark);
      }
      
      .warning-banner {
        border: 2px solid #000;
      }
    }
  </style>
</head>
<body>
```

- [ ] **步骤 2：添加页面头部和警告横幅**

在 body 标签后添加：

```html
  <!-- 页面头部 -->
  <header class="page-header">
    <h1>视频项目操作指南</h1>
    <p>从服装到成片的完整流程，帮助电商商家快速上手</p>
  </header>
  
  <!-- 重要提醒 -->
  <div class="container">
    <div class="warning-banner">
      <span class="icon">⚠️</span>
      <p><strong>重要提醒：</strong>项目类型选择后不可撤回，请先阅读本指南，了解完整流程后再开始创建项目。</p>
    </div>
  </div>
```

- [ ] **步骤 3：添加侧边目录和主内容区框架**

```html
  <!-- 主内容区 -->
  <div class="container">
    <div class="main-content">
      <!-- 侧边目录 -->
      <aside class="sidebar">
        <h3>目录导航</h3>
        <nav>
          <a href="#chapter-1">第一章：开始前最重要的决策</a>
          <a href="#chapter-2">第二章：Step1 服装上传与搭配</a>
          <a href="#chapter-3">第三章：Step2 角色定妆</a>
          <a href="#chapter-4">第四章：Step3 脚本与分镜</a>
          <a href="#chapter-5">第五章：Step4 视频生成</a>
          <a href="#chapter-6">第六章：Step5 发布准备</a>
          <a href="#chapter-7">第七章：Step6 裂变扩展</a>
          <a href="#appendix">附录：素材准备清单</a>
        </nav>
      </aside>
      
      <!-- 内容区 -->
      <main class="content">
```

- [ ] **步骤 4：添加第一章内容**

```html
        <!-- 第一章：开始前最重要的决策 -->
        <section class="chapter" id="chapter-1">
          <div class="chapter-header">
            <div class="chapter-number">1</div>
            <div>
              <h2 class="chapter-title">开始前最重要的决策</h2>
              <p class="chapter-desc">项目类型选择后不可撤回，请仔细阅读</p>
            </div>
          </div>
          
          <section class="section">
            <h3>1.1 三种项目类型对比</h3>
            <div class="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>项目类型</th>
                    <th>流程步骤</th>
                    <th>产出物</th>
                    <th>适用场景</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><strong>视频项目</strong></td>
                    <td>6 步（服装→定妆→脚本分镜→视频生成→发布→裂变）</td>
                    <td>电商短视频</td>
                    <td>需要生成商品展示视频的商家</td>
                  </tr>
                  <tr>
                    <td><strong>图片项目</strong></td>
                    <td>4 步（服装→定妆→模特图→详情页）</td>
                    <td>商品详情页图片</td>
                    <td>需要生成商品主图/详情图的商家</td>
                  </tr>
                  <tr>
                    <td><strong>换装项目</strong></td>
                    <td>4 步（选视频→选服装→选角色→一键换装）</td>
                    <td>换装视频</td>
                    <td>已有视频，需要替换服装的商家</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
          
          <section class="section">
            <h3>1.2 视频项目适合哪些商家？</h3>
            <div class="checklist">
              <div class="checklist-item">
                <div class="checkbox">✓</div>
                <div class="text">
                  <strong>需要生成电商短视频的商家</strong>
                  <span>— 抖音、快手、小红书等平台的商品展示视频</span>
                </div>
              </div>
              <div class="checklist-item">
                <div class="checkbox">✓</div>
                <div class="text">
                  <strong>已有服装素材，想快速产出视频</strong>
                  <span>— 上传服装照片，AI 自动生成搭配和视频</span>
                </div>
              </div>
              <div class="checklist-item">
                <div class="checkbox">✓</div>
                <div class="text">
                  <strong>需要批量生成多个服装视频</strong>
                  <span>— 一次上传多款服装，分别生成视频</span>
                </div>
              </div>
              <div class="checklist-item">
                <div class="checkbox" style="border-color: var(--warning); color: var(--warning);">✗</div>
                <div class="text">
                  <strong>暂不建议的情况</strong>
                  <span>— 只有一张图片、图片质量差、服装不清晰</span>
                </div>
              </div>
            </div>
          </section>
          
          <section class="section">
            <h3>1.3 案例：服装店老板小王的选择</h3>
            <div class="case-card">
              <div class="case-header">
                <span class="case-icon">👤</span>
                <span class="case-title">真实案例</span>
              </div>
              <div class="case-content">
                <p>小王经营一家女装店，最近进了 5 款春装新品，想在抖音上发短视频推广。</p>
                <p style="margin-top: 12px;"><strong>他的选择：</strong>视频项目</p>
                <p style="margin-top: 8px;"><strong>原因：</strong>需要给每款服装生成独立的展示视频，方便在抖音发布。他有现成的服装照片，可以直接上传使用。</p>
                <p style="margin-top: 8px; color: var(--success);"><strong>结果：</strong>半天时间完成了 5 个视频，顺利发布到抖音。</p>
              </div>
            </div>
          </section>
        </section>
```

- [ ] **步骤 5：添加第二章内容**

```html
        <!-- 第二章：Step1 服装上传与搭配推荐 -->
        <section class="chapter" id="chapter-2">
          <div class="chapter-header">
            <div class="chapter-number">2</div>
            <div>
              <h2 class="chapter-title">Step1：服装上传与搭配推荐</h2>
              <p class="chapter-desc">上传服装照片，系统自动推荐搭配方案</p>
            </div>
          </div>
          
          <div class="progress-indicator">
            <span class="step">进度：</span>
            <span class="current">Step 1/6</span>
          </div>
          
          <section class="section">
            <h3>2.1 上传前的准备清单</h3>
            <div class="checklist">
              <div class="checklist-item">
                <div class="checkbox">✓</div>
                <div class="text">
                  <strong>服装照片拍摄要求</strong>
                  <span>— <em style="color: var(--primary);">【待补充：光线、背景、角度建议】</em></span>
                </div>
              </div>
              <div class="checklist-item">
                <div class="checkbox">✓</div>
                <div class="text">
                  <strong>每款服装建议上传数量</strong>
                  <span>— <em style="color: var(--primary);">【待补充：建议上传几张照片】</em></span>
                </div>
              </div>
              <div class="checklist-item">
                <div class="checkbox">✓</div>
                <div class="text">
                  <strong>图片格式和尺寸要求</strong>
                  <span>— <em style="color: var(--primary);">【待补充：支持格式、尺寸限制】</em></span>
                </div>
              </div>
            </div>
            <div class="tip">
              <p><strong>💡 提示：</strong>照片质量越好，生成效果越好。建议使用清晰、光线均匀的正反面照片。</p>
            </div>
          </section>
          
          <section class="section">
            <h3>2.2 系统搭配推荐是什么</h3>
            <p>上传服装照片后，系统会自动分析服装风格、颜色、款式，为您推荐合适的搭配方案。您可以选择系统推荐，也可以自行调整搭配。</p>
          </section>
          
          <section class="section">
            <h3>2.3 如何选择搭配方案</h3>
            <div class="checklist">
              <div class="checklist-item">
                <div class="checkbox">✓</div>
                <div class="text">
                  <strong>查看整体搭配效果</strong>
                  <span>— 系统会展示服装组合的预览图</span>
                </div>
              </div>
              <div class="checklist-item">
                <div class="checkbox">✓</div>
                <div class="text">
                  <strong>考虑目标场景</strong>
                  <span>— 选择适合展示场景的搭配（如休闲、商务、户外）</span>
                </div>
              </div>
              <div class="checklist-item">
                <div class="checkbox">✓</div>
                <div class="text">
                  <strong>确认后不可更改</strong>
                  <span>— 选择搭配方案后进入下一步，无法退回修改</span>
                </div>
              </div>
            </div>
            <div class="alert alert-warning">
              <strong>⚠️ 注意：</strong>搭配方案确认后将进入定妆环节，无法返回此步骤修改。请仔细确认后再进入下一步。
            </div>
          </section>
          
          <section class="section">
            <h3>2.4 案例：小王上传了 3 款服装</h3>
            <div class="case-card">
              <div class="case-header">
                <span class="case-icon">👤</span>
                <span class="case-title">真实案例</span>
              </div>
              <div class="case-content">
                <p>小王上传了 3 款春装：白色衬衫、浅蓝色牛仔裤、米色风衣。</p>
                <p style="margin-top: 12px;"><strong>系统推荐：</strong>三件搭配成"都市通勤"风格套装</p>
                <p style="margin-top: 8px;"><strong>小王的操作：</strong>确认采用系统推荐，点击"下一步"进入定妆环节。</p>
              </div>
            </div>
          </section>
        </section>
```

- [ ] **步骤 6：添加第三章内容**

```html
        <!-- 第三章：Step2 角色定妆 -->
        <section class="chapter" id="chapter-3">
          <div class="chapter-header">
            <div class="chapter-number">3</div>
            <div>
              <h2 class="chapter-title">Step2：角色定妆</h2>
              <p class="chapter-desc">确定视频中人物的形象和风格</p>
            </div>
          </div>
          
          <div class="progress-indicator">
            <span class="step">进度：</span>
            <span class="current">Step 2/6</span>
          </div>
          
          <section class="section">
            <h3>3.1 定妆是什么？为什么重要？</h3>
            <p>定妆是为视频中的虚拟人物确定形象和风格。系统会根据您的服装和风格偏好，生成适合的人物形象。定妆结果会影响视频的整体风格和人物表现。</p>
          </section>
          
          <section class="section">
            <h3>3.2 定妆前需要准备什么</h3>
            <div class="checklist">
              <div class="checklist-item">
                <div class="checkbox">✓</div>
                <div class="text">
                  <strong>目标风格描述</strong>
                  <span>— <em style="color: var(--primary);">【待补充：常见风格示例，如休闲、商务、优雅】</em></span>
                </div>
              </div>
              <div class="checklist-item">
                <div class="checkbox">✓</div>
                <div class="text">
                  <strong>参考图片（可选）</strong>
                  <span>— 有喜欢的风格图片可以上传参考</span>
                </div>
              </div>
            </div>
          </section>
          
          <section class="section">
            <h3>3.3 五视图是什么，如何确认</h3>
            <p>五视图是系统生成的人物形象多角度展示：正面、侧面、背面、四分之三侧面等。</p>
            <div class="checklist">
              <div class="checklist-item">
                <div class="checkbox">✓</div>
                <div class="text">
                  <strong>检查人物形象是否符合预期</strong>
                  <span>— 确认服装、发型、妆容风格</span>
                </div>
              </div>
              <div class="checklist-item">
                <div class="checkbox">✓</div>
                <div class="text">
                  <strong>检查各角度是否协调</strong>
                  <span>— 确保正反面、侧面风格一致</span>
                </div>
              </div>
              <div class="checklist-item">
                <div class="checkbox">✓</div>
                <div class="text">
                  <strong>不满意可重新生成</strong>
                  <span>— 如不满意，可调整描述重新生成</span>
                </div>
              </div>
            </div>
          </section>
          
          <section class="section">
            <h3>3.4 案例：小王定妆"都市白领"风格</h3>
            <div class="case-card">
              <div class="case-header">
                <span class="case-icon">👤</span>
                <span class="case-title">真实案例</span>
              </div>
              <div class="case-content">
                <p>小王希望视频风格偏"都市白领"，适合上班族穿着场景。</p>
                <p style="margin-top: 12px;"><strong>操作：</strong>选择"都市白领"风格标签，系统生成职业女性形象</p>
                <p style="margin-top: 8px;"><strong>五视图确认：</strong>小王仔细查看五个角度的人物形象，确认符合预期后点击"确认定妆"</p>
              </div>
            </div>
          </section>
        </section>
```

- [ ] **步骤 7：添加第四章内容**

```html
        <!-- 第四章：Step3 脚本与分镜生成 -->
        <section class="chapter" id="chapter-4">
          <div class="chapter-header">
            <div class="chapter-number">4</div>
            <div>
              <h2 class="chapter-title">Step3：脚本与分镜生成</h2>
              <p class="chapter-desc">生成视频脚本和分镜画面</p>
            </div>
          </div>
          
          <div class="progress-indicator">
            <span class="step">进度：</span>
            <span class="current">Step 3/6</span>
          </div>
          
          <section class="section">
            <h3>4.1 脚本生成的工作原理</h3>
            <p>系统会根据您的服装、搭配和定妆风格，自动生成适合的短视频脚本。脚本包含场景描述、人物动作、镜头切换等内容。您可以查看脚本并进行修改。</p>
          </section>
          
          <section class="section">
            <h3>4.2 如何修改脚本内容</h3>
            <div class="checklist">
              <div class="checklist-item">
                <div class="checkbox">✓</div>
                <div class="text">
                  <strong>直接编辑脚本文字</strong>
                  <span>— 点击脚本内容即可修改描述</span>
                </div>
              </div>
              <div class="checklist-item">
                <div class="checkbox">✓</div>
                <div class="text">
                  <strong>调整场景顺序</strong>
                  <span>— 拖拽调整场景播放顺序</span>
                </div>
              </div>
              <div class="checklist-item">
                <div class="checkbox">✓</div>
                <div class="text">
                  <strong>添加/删除场景</strong>
                  <span>— 根据需要增减视频场景</span>
                </div>
              </div>
            </div>
          </section>
          
          <section class="section">
            <h3>4.3 分镜的作用和确认要点</h3>
            <p>分镜是将脚本转化为可视化的画面预览。每个分镜对应视频中的一个镜头，展示人物动作、服装展示方式、场景背景等。</p>
            <div class="checklist">
              <div class="checklist-item">
                <div class="checkbox">✓</div>
                <div class="text">
                  <strong>检查服装是否正确展示</strong>
                  <span>— 确认服装细节清晰可见</span>
                </div>
              </div>
              <div class="checklist-item">
                <div class="checkbox">✓</div>
                <div class="text">
                  <strong>检查场景是否符合预期</strong>
                  <span>— 背景、光线是否与服装搭配</span>
                </div>
              </div>
              <div class="checklist-item">
                <div class="checkbox">✓</div>
                <div class="text">
                  <strong>检查人物动作是否自然</strong>
                  <span>— 姿态、表情是否协调</span>
                </div>
              </div>
            </div>
            <div class="alert alert-warning">
              <strong>⚠️ 注意：</strong>脚本和分镜确认后将进入视频生成环节，无法返回修改。请仔细检查后再确认。
            </div>
          </section>
          
          <section class="section">
            <h3>4.4 案例：小王调整脚本强调"春季新品"</h3>
            <div class="case-card">
              <div class="case-header">
                <span class="case-icon">👤</span>
                <span class="case-title">真实案例</span>
              </div>
              <div class="case-content">
                <p>系统生成的脚本是通用的服装展示视频。小王想在抖音强调"春季新品"主题。</p>
                <p style="margin-top: 12px;"><strong>操作：</strong>修改脚本开头，添加"春季新品上市"文字描述</p>
                <p style="margin-top: 8px;"><strong>分镜确认：</strong>查看每个分镜画面，确认服装展示效果，点击"确认分镜"</p>
              </div>
            </div>
          </section>
        </section>
```

- [ ] **步骤 8：添加第五、六、七章内容**

```html
        <!-- 第五章：Step4 视频生成与合成 -->
        <section class="chapter" id="chapter-5">
          <div class="chapter-header">
            <div class="chapter-number">5</div>
            <div>
              <h2 class="chapter-title">Step4：视频生成与合成</h2>
              <p class="chapter-desc">AI 自动生成视频内容</p>
            </div>
          </div>
          
          <div class="progress-indicator">
            <span class="step">进度：</span>
            <span class="current">Step 4/6</span>
          </div>
          
          <section class="section">
            <h3>5.1 视频生成的等待时间</h3>
            <p>视频生成需要一定时间，具体时长取决于视频长度和复杂度。<em style="color: var(--primary);">【待补充：各阶段预估时间】</em></p>
            <div class="tip">
              <p><strong>💡 提示：</strong>生成过程中您可以离开页面，系统会自动保存进度。完成后会有通知提醒。</p>
            </div>
          </section>
          
          <section class="section">
            <h3>5.2 如何查看生成进度</h3>
            <p>在项目详情页可以看到当前生成进度和状态。包括：排队中、生成中、已完成。</p>
          </section>
          
          <section class="section">
            <h3>5.3 成片预览和确认</h3>
            <p>视频生成完成后，可以在线预览成片效果。检查画面质量、服装展示、整体流畅度。</p>
          </section>
          
          <section class="section">
            <h3>5.4 不满意怎么办？</h3>
            <div class="checklist">
              <div class="checklist-item">
                <div class="checkbox">✓</div>
                <div class="text">
                  <strong>重新生成</strong>
                  <span>— 可返回修改脚本或分镜，重新生成视频</span>
                </div>
              </div>
              <div class="checklist-item">
                <div class="checkbox">✓</div>
                <div class="text">
                  <strong>裂变功能</strong>
                  <span>— 基于当前视频，生成多个变体版本</span>
                </div>
              </div>
            </div>
          </section>
        </section>
        
        <!-- 第六章：Step5 发布准备 -->
        <section class="chapter" id="chapter-6">
          <div class="chapter-header">
            <div class="chapter-number">6</div>
            <div>
              <h2 class="chapter-title">Step5：发布准备</h2>
              <p class="chapter-desc">准备发布到各平台</p>
            </div>
          </div>
          
          <div class="progress-indicator">
            <span class="step">进度：</span>
            <span class="current">Step 5/6</span>
          </div>
          
          <section class="section">
            <h3>6.1 发布前的检查清单</h3>
            <div class="checklist">
              <div class="checklist-item">
                <div class="checkbox">✓</div>
                <div class="text">
                  <strong>视频时长是否符合平台要求</strong>
                  <span>— 不同平台有不同的时长限制</span>
                </div>
              </div>
              <div class="checklist-item">
                <div class="checkbox">✓</div>
                <div class="text">
                  <strong>视频画面是否清晰</strong>
                  <span>— 检查服装细节是否清楚</span>
                </div>
              </div>
              <div class="checklist-item">
                <div class="checkbox">✓</div>
                <div class="text">
                  <strong>视频内容是否符合平台规范</strong>
                  <span>— 确保无违规内容</span>
                </div>
              </div>
            </div>
          </section>
          
          <section class="section">
            <h3>6.2 支持的发布平台</h3>
            <p><em style="color: var(--primary);">【待补充：支持发布的平台列表，如抖音、快手、小红书】</em></p>
          </section>
        </section>
        
        <!-- 第七章：Step6 裂变扩展 -->
        <section class="chapter" id="chapter-7">
          <div class="chapter-header">
            <div class="chapter-number">7</div>
            <div>
              <h2 class="chapter-title">Step6：裂变扩展</h2>
              <p class="chapter-desc">基于已生成的视频创建更多变体</p>
            </div>
          </div>
          
          <div class="progress-indicator">
            <span class="step">进度：</span>
            <span class="current">Step 6/6</span>
          </div>
          
          <section class="section">
            <h3>7.1 裂变是什么？能做什么？</h3>
            <p>裂变功能可以基于已完成的视频，快速生成多个变体版本。适用于：</p>
            <div class="checklist">
              <div class="checklist-item">
                <div class="checkbox">✓</div>
                <div class="text">
                  <strong>不同风格版本</strong>
                  <span>— 同一服装，不同背景或音乐</span>
                </div>
              </div>
              <div class="checklist-item">
                <div class="checkbox">✓</div>
                <div class="text">
                  <strong>不同时长版本</strong>
                  <span>— 裁剪成不同长度适应各平台</span>
                </div>
              </div>
              <div class="checklist-item">
                <div class="checkbox">✓</div>
                <div class="text">
                  <strong>批量生成</strong>
                  <span>— 一次生成多个变体，提高效率</span>
                </div>
              </div>
            </div>
          </section>
          
          <section class="section">
            <h3>7.2 如何使用裂变功能</h3>
            <p>在项目详情页点击"裂变"按钮，选择裂变类型和参数，系统会自动生成变体视频。</p>
          </section>
        </section>
```

- [ ] **步骤 9：添加附录和页脚**

```html
        <!-- 附录 -->
        <section class="chapter" id="appendix">
          <div class="chapter-header">
            <div class="chapter-number">+</div>
            <div>
              <h2 class="chapter-title">附录：素材准备快速清单</h2>
              <p class="chapter-desc">开始项目前的完整准备清单</p>
            </div>
          </div>
          
          <section class="section">
            <h3>服装拍摄要点</h3>
            <div class="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>拍摄要点</th>
                    <th>具体要求</th>
                    <th>注意事项</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><strong>光线</strong></td>
                    <td><em style="color: var(--primary);">【待补充】</em></td>
                    <td><em style="color: var(--primary);">【待补充】</em></td>
                  </tr>
                  <tr>
                    <td><strong>背景</strong></td>
                    <td><em style="color: var(--primary);">【待补充】</em></td>
                    <td><em style="color: var(--primary);">【待补充】</em></td>
                  </tr>
                  <tr>
                    <td><strong>角度</strong></td>
                    <td><em style="color: var(--primary);">【待补充】</em></td>
                    <td><em style="color: var(--primary);">【待补充】</em></td>
                  </tr>
                  <tr>
                    <td><strong>图片格式</strong></td>
                    <td><em style="color: var(--primary);">【待补充】</em></td>
                    <td><em style="color: var(--primary);">【待补充】</em></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
          
          <section class="section">
            <h3>常见问题</h3>
            <div class="checklist">
              <div class="checklist-item">
                <div class="checkbox">?</div>
                <div class="text">
                  <strong>项目类型选错了怎么办？</strong>
                  <span>— 无法撤回，需要重新创建新项目</span>
                </div>
              </div>
              <div class="checklist-item">
                <div class="checkbox">?</div>
                <div class="text">
                  <strong>服装照片上传后不满意怎么办？</strong>
                  <span>— 在确认搭配前可以重新上传</span>
                </div>
              </div>
              <div class="checklist-item">
                <div class="checkbox">?</div>
                <div class="text">
                  <strong>定妆后能修改吗？</strong>
                  <span>— 确认后无法修改，需要重新创建项目</span>
                </div>
              </div>
              <div class="checklist-item">
                <div class="checkbox">?</div>
                <div class="text">
                  <strong>视频生成失败怎么办？</strong>
                  <span>— 检查素材是否符合要求，重新提交生成</span>
                </div>
              </div>
              <div class="checklist-item">
                <div class="checkbox">?</div>
                <div class="text">
                  <strong>可以导出视频到本地吗？</strong>
                  <span>— 可以，在成片页面点击下载</span>
                </div>
              </div>
            </div>
          </section>
        </section>
        
      </main>
    </div>
  </div>
  
  <!-- 页脚 -->
  <footer class="page-footer">
    <p>如有疑问，请联系客服获取帮助</p>
    <p style="margin-top: 8px;">查看 <a href="video-project-faq.html">常见问题版</a> 文档</p>
  </footer>
</body>
</html>
```

- [ ] **步骤 10：验证 HTML 文件创建成功**

运行：`ls -la public/user-guide/video-project-guide.html`
预期：文件存在，大小约 20-30KB

---

## 任务 3：创建常见问题版 HTML 文件

**文件：**
- 创建：`public/user-guide/video-project-faq.html`

- [ ] **步骤 1：创建 HTML 文件骨架和头部**

创建 `public/user-guide/video-project-faq.html`，包含：
- DOCTYPE 和 html 标签
- head 部分：meta 标签、标题、内嵌 CSS 样式（复用流程版样式 + FAQ 专用样式）
- body 开始标签

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="内容喵视频项目常见问题解答 - 新手必看，快速了解视频项目操作要点。">
  <title>视频项目常见问题解答 - 内容喵</title>
  <style>
    /* 全局样式 */
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
      background-color: #fdfbf7;
      color: #333333;
      line-height: 1.8;
      font-size: 16px;
    }
    
    /* 配色变量 */
    :root {
      --primary: #e68c19;
      --primary-light: #f5a623;
      --bg-light: #fdfbf7;
      --bg-card: #ffffff;
      --text-dark: #333333;
      --text-light: #666666;
      --success: #22c55e;
      --warning: #ef4444;
      --border: #e5e5e5;
    }
    
    /* 容器 */
    .container {
      max-width: 900px;
      margin: 0 auto;
      padding: 20px;
    }
    
    /* 页面头部 */
    .page-header {
      background: linear-gradient(135deg, var(--primary) 0%, var(--primary-light) 100%);
      color: white;
      padding: 50px 20px;
      text-align: center;
    }
    
    .page-header h1 {
      font-size: 28px;
      font-weight: 700;
      margin-bottom: 12px;
    }
    
    .page-header p {
      font-size: 16px;
      opacity: 0.95;
    }
    
    /* 分类标签导航 */
    .category-nav {
      background: var(--bg-card);
      padding: 16px 20px;
      border-bottom: 1px solid var(--border);
      position: sticky;
      top: 0;
      z-index: 100;
    }
    
    .category-nav .nav-wrapper {
      max-width: 900px;
      margin: 0 auto;
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    
    .category-nav a {
      padding: 8px 16px;
      background: #f5f5f5;
      color: var(--text-dark);
      text-decoration: none;
      border-radius: 20px;
      font-size: 14px;
      transition: all 0.2s;
    }
    
    .category-nav a:hover,
    .category-nav a.active {
      background: var(--primary);
      color: white;
    }
    
    /* 分类区块 */
    .category-section {
      margin-top: 40px;
    }
    
    .category-title {
      font-size: 20px;
      font-weight: 700;
      color: var(--text-dark);
      padding-bottom: 12px;
      border-bottom: 3px solid var(--primary);
      margin-bottom: 24px;
      display: flex;
      align-items: center;
      gap: 12px;
    }
    
    .category-title .icon {
      font-size: 24px;
    }
    
    /* 问题卡片 */
    .qa-card {
      background: var(--bg-card);
      border: 2px solid var(--border);
      border-radius: 12px;
      margin-bottom: 16px;
      overflow: hidden;
      transition: all 0.2s;
    }
    
    .qa-card:hover {
      border-color: var(--primary);
      box-shadow: 0 4px 12px rgba(230, 140, 25, 0.1);
    }
    
    .qa-card .question {
      padding: 20px;
      display: flex;
      align-items: flex-start;
      gap: 16px;
      cursor: pointer;
    }
    
    .qa-card .q-number {
      width: 32px;
      height: 32px;
      background: var(--primary);
      color: white;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 14px;
      flex-shrink: 0;
    }
    
    .qa-card .q-text {
      flex: 1;
      font-size: 16px;
      font-weight: 600;
      color: var(--text-dark);
    }
    
    .qa-card .q-text.important::before {
      content: "⚠️ ";
    }
    
    .qa-card .answer {
      padding: 0 20px 20px 68px;
      color: var(--text-light);
    }
    
    .qa-card .answer p {
      margin-bottom: 12px;
    }
    
    .qa-card .answer p:last-child {
      margin-bottom: 0;
    }
    
    /* 警告框 */
    .alert {
      background: #fef2f2;
      border-left: 4px solid var(--warning);
      padding: 12px 16px;
      border-radius: 0 8px 8px 0;
      margin: 12px 0;
      color: #991b1b;
    }
    
    /* 提示框 */
    .tip {
      background: #f0fdf4;
      border-left: 4px solid var(--success);
      padding: 12px 16px;
      border-radius: 0 8px 8px 0;
      margin: 12px 0;
      color: #166534;
    }
    
    /* 清单样式 */
    .checklist {
      margin: 12px 0;
    }
    
    .checklist-item {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      padding: 8px 0;
    }
    
    .checklist-item .checkbox {
      color: var(--primary);
      flex-shrink: 0;
    }
    
    /* 表格样式 */
    .table-wrapper {
      overflow-x: auto;
      margin: 12px 0;
    }
    
    table {
      width: 100%;
      border-collapse: collapse;
      background: var(--bg-card);
      border-radius: 8px;
      overflow: hidden;
    }
    
    th {
      background: var(--primary);
      color: white;
      padding: 12px;
      text-align: left;
      font-weight: 600;
      font-size: 14px;
    }
    
    td {
      padding: 12px;
      border-bottom: 1px solid var(--border);
      font-size: 14px;
    }
    
    tr:last-child td {
      border-bottom: none;
    }
    
    tr:nth-child(even) {
      background: #fafafa;
    }
    
    /* 页脚 */
    .page-footer {
      text-align: center;
      padding: 40px 20px;
      border-top: 1px solid var(--border);
      margin-top: 60px;
      color: var(--text-light);
    }
    
    .page-footer a {
      color: var(--primary);
      text-decoration: none;
    }
    
    /* 响应式设计 */
    @media (max-width: 768px) {
      .page-header {
        padding: 40px 20px;
      }
      
      .page-header h1 {
        font-size: 22px;
      }
      
      .category-nav {
        padding: 12px;
      }
      
      .category-nav a {
        padding: 6px 12px;
        font-size: 13px;
      }
      
      .qa-card .question {
        padding: 16px;
      }
      
      .qa-card .answer {
        padding: 0 16px 16px 16px;
      }
    }
    
    /* 打印样式 */
    @media print {
      .category-nav {
        display: none;
      }
      
      .qa-card {
        break-inside: avoid;
      }
    }
  </style>
</head>
<body>
```

- [ ] **步骤 2：添加页面头部和分类导航**

```html
  <!-- 页面头部 -->
  <header class="page-header">
    <h1>视频项目常见问题解答</h1>
    <p>新手必看 · 项目类型选择后不可撤回 · 提前了解避免返工</p>
  </header>
  
  <!-- 分类导航 -->
  <nav class="category-nav">
    <div class="nav-wrapper">
      <a href="#category-start">开始前决策</a>
      <a href="#category-step1">Step1 上传</a>
      <a href="#category-step2">Step2 定妆</a>
      <a href="#category-step3">Step3 脚本</a>
      <a href="#category-step4">Step4 视频</a>
      <a href="#category-publish">发布裂变</a>
      <a href="#category-checklist">准备清单</a>
    </div>
  </nav>
```

- [ ] **步骤 3：添加第一类问题（开始前决策）**

```html
  <div class="container">
    <!-- 第一类：开始前的决策问题 -->
    <section class="category-section" id="category-start">
      <h2 class="category-title"><span class="icon">🎯</span> 开始前的决策问题</h2>
      
      <div class="qa-card">
        <div class="question">
          <div class="q-number">Q1</div>
          <div class="q-text">三种项目类型有什么区别？我该选哪个？</div>
        </div>
        <div class="answer">
          <table>
            <thead>
              <tr>
                <th>项目类型</th>
                <th>流程</th>
                <th>产出</th>
                <th>适合场景</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>视频项目</strong></td>
                <td>6 步</td>
                <td>电商短视频</td>
                <td>需要商品展示视频</td>
              </tr>
              <tr>
                <td><strong>图片项目</strong></td>
                <td>4 步</td>
                <td>商品详情图</td>
                <td>需要商品主图/详情图</td>
              </tr>
              <tr>
                <td><strong>换装项目</strong></td>
                <td>4 步</td>
                <td>换装视频</td>
                <td>已有视频需换服装</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      
      <div class="qa-card">
        <div class="question">
          <div class="q-number">Q2</div>
          <div class="q-text">视频项目适合我吗？</div>
        </div>
        <div class="answer">
          <p><strong>适合以下情况：</strong></p>
          <div class="checklist">
            <div class="checklist-item"><span class="checkbox">✓</span><span>需要生成抖音/快手/小红书商品展示视频</span></div>
            <div class="checklist-item"><span class="checkbox">✓</span><span>已有服装素材，想快速产出视频</span></div>
            <div class="checklist-item"><span class="checkbox">✓</span><span>需要批量生成多个服装视频</span></div>
          </div>
          <p style="margin-top: 12px;"><strong>暂不建议：</strong>只有一张图片、图片质量差、服装不清晰</p>
        </div>
      </div>
      
      <div class="qa-card">
        <div class="question">
          <div class="q-number">Q3</div>
          <div class="q-text important">开始项目前需要准备什么素材？</div>
        </div>
        <div class="answer">
          <div class="checklist">
            <div class="checklist-item"><span class="checkbox">✓</span><span>清晰的服装照片（<em style="color: var(--primary);">【待补充：拍摄要求】</em>）</span></div>
            <div class="checklist-item"><span class="checkbox">✓</span><span>目标风格描述（如休闲、商务、优雅）</span></div>
            <div class="checklist-item"><span class="checkbox">✓</span><span>参考图片（可选）</span></div>
          </div>
          <div class="alert">
            <strong>重要：</strong>素材质量直接影响生成效果，建议提前准备好高质量照片。
          </div>
        </div>
      </div>
    </section>
```

- [ ] **步骤 4：添加第二类问题（Step1 上传）**

```html
    <!-- 第二类：Step1 服装上传问题 -->
    <section class="category-section" id="category-step1">
      <h2 class="category-title"><span class="icon">👕</span> Step1 服装上传问题</h2>
      
      <div class="qa-card">
        <div class="question">
          <div class="q-number">Q4</div>
          <div class="q-text">服装照片怎么拍效果更好？</div>
        </div>
        <div class="answer">
          <p><em style="color: var(--primary);">【待补充：光线、背景、角度具体建议】</em></p>
          <div class="tip">
            <strong>💡 建议：</strong>照片质量越好，生成效果越好。使用清晰、光线均匀的正反面照片。
          </div>
        </div>
      </div>
      
      <div class="qa-card">
        <div class="question">
          <div class="q-number">Q5</div>
          <div class="q-text">每款服装需要上传几张照片？</div>
        </div>
        <div class="answer">
          <p><em style="color: var(--primary);">【待补充：建议数量和原因】</em></p>
        </div>
      </div>
      
      <div class="qa-card">
        <div class="question">
          <div class="q-number">Q6</div>
          <div class="q-text">系统推荐的搭配方案是怎么来的？</div>
        </div>
        <div class="answer">
          <p>系统会自动分析您上传的服装风格、颜色、款式，基于 AI 算法推荐合适的搭配组合。您可以选择系统推荐，也可以自行调整。</p>
        </div>
      </div>
      
      <div class="qa-card">
        <div class="question">
          <div class="q-number">Q7</div>
          <div class="q-text important">搭配方案选错了能改吗？</div>
        </div>
        <div class="answer">
          <div class="alert">
            <strong>不能撤回！</strong>搭配方案确认后将进入定妆环节，无法返回此步骤修改。请在确认前仔细检查。
          </div>
        </div>
      </div>
      
      <div class="qa-card">
        <div class="question">
          <div class="q-number">Q8</div>
          <div class="q-text">上传的图片有什么格式要求？</div>
        </div>
        <div class="answer">
          <p><em style="color: var(--primary);">【待补充：支持的格式、尺寸、大小限制】</em></p>
        </div>
      </div>
    </section>
```

- [ ] **步骤 5：添加第三类问题（Step2 定妆）**

```html
    <!-- 第三类：Step2 定妆问题 -->
    <section class="category-section" id="category-step2">
      <h2 class="category-title"><span class="icon">👤</span> Step2 定妆问题</h2>
      
      <div class="qa-card">
        <div class="question">
          <div class="q-number">Q9</div>
          <div class="q-text">定妆是什么意思？</div>
        </div>
        <div class="answer">
          <p>定妆是为视频中的虚拟人物确定形象和风格。系统会根据您的服装和风格偏好，生成适合的人物形象。定妆结果会影响视频的整体风格。</p>
        </div>
      </div>
      
      <div class="qa-card">
        <div class="question">
          <div class="q-number">Q10</div>
          <div class="q-text">定妆风格怎么描述？</div>
        </div>
        <div class="answer">
          <p><strong>常见风格示例：</strong></p>
          <p><em style="color: var(--primary);">【待补充：休闲风、商务风、优雅风、街头风等风格描述模板】</em></p>
        </div>
      </div>
      
      <div class="qa-card">
        <div class="question">
          <div class="q-number">Q11</div>
          <div class="q-text">五视图是什么，看不懂怎么办？</div>
        </div>
        <div class="answer">
          <p>五视图是系统生成的人物形象多角度展示：正面、侧面、背面、四分之三侧面等。</p>
          <p style="margin-top: 8px;"><strong>检查要点：</strong></p>
          <div class="checklist">
            <div class="checklist-item"><span class="checkbox">✓</span><span>服装、发型、妆容风格是否符合预期</span></div>
            <div class="checklist-item"><span class="checkbox">✓</span><span>各角度风格是否一致协调</span></div>
          </div>
          <p style="margin-top: 8px;">如不满意，可调整描述重新生成。</p>
        </div>
      </div>
      
      <div class="qa-card">
        <div class="question">
          <div class="q-number">Q12</div>
          <div class="q-text important">定妆确认后能修改吗？</div>
        </div>
        <div class="answer">
          <div class="alert">
            <strong>不能修改！</strong>定妆确认后将进入脚本生成环节，无法返回修改。需要重新创建项目才能更换定妆方案。
          </div>
        </div>
      </div>
    </section>
```

- [ ] **步骤 6：添加第四类问题（Step3 脚本分镜）**

```html
    <!-- 第四类：Step3 脚本分镜问题 -->
    <section class="category-section" id="category-step3">
      <h2 class="category-title"><span class="icon">📝</span> Step3 脚本分镜问题</h2>
      
      <div class="qa-card">
        <div class="question">
          <div class="q-number">Q13</div>
          <div class="q-text">脚本是自动生成的还是我写的？</div>
        </div>
        <div class="answer">
          <p>系统会根据您的服装、搭配和定妆风格，自动生成适合的短视频脚本。脚本包含场景描述、人物动作、镜头切换等内容。您可以查看并修改脚本。</p>
        </div>
      </div>
      
      <div class="qa-card">
        <div class="question">
          <div class="q-number">Q14</div>
          <div class="q-text">脚本内容不满意怎么调整？</div>
        </div>
        <div class="answer">
          <div class="checklist">
            <div class="checklist-item"><span class="checkbox">✓</span><span>直接编辑脚本文字 — 点击脚本内容即可修改</span></div>
            <div class="checklist-item"><span class="checkbox">✓</span><span>调整场景顺序 — 拖拽调整播放顺序</span></div>
            <div class="checklist-item"><span class="checkbox">✓</span><span>添加/删除场景 — 根据需要增减视频场景</span></div>
          </div>
        </div>
      </div>
      
      <div class="qa-card">
        <div class="question">
          <div class="q-number">Q15</div>
          <div class="q-text">分镜是什么？我需要检查什么？</div>
        </div>
        <div class="answer">
          <p>分镜是将脚本转化为可视化的画面预览。每个分镜对应视频中的一个镜头。</p>
          <p style="margin-top: 8px;"><strong>检查要点：</strong></p>
          <div class="checklist">
            <div class="checklist-item"><span class="checkbox">✓</span><span>服装是否正确展示，细节是否清晰</span></div>
            <div class="checklist-item"><span class="checkbox">✓</span><span>场景背景是否符合预期</span></div>
            <div class="checklist-item"><span class="checkbox">✓</span><span>人物动作姿态是否自然协调</span></div>
          </div>
        </div>
      </div>
      
      <div class="qa-card">
        <div class="question">
          <div class="q-number">Q16</div>
          <div class="q-text important">脚本和分镜确认后还能改吗？</div>
        </div>
        <div class="answer">
          <div class="alert">
            <strong>不能修改！</strong>确认后将进入视频生成环节，无法返回。请仔细检查后再确认。
          </div>
        </div>
      </div>
    </section>
```

- [ ] **步骤 7：添加第五类问题（Step4 视频）**

```html
    <!-- 第五类：Step4 视频生成问题 -->
    <section class="category-section" id="category-step4">
      <h2 class="category-title"><span class="icon">🎬</span> Step4 视频生成问题</h2>
      
      <div class="qa-card">
        <div class="question">
          <div class="q-number">Q17</div>
          <div class="q-text">视频生成需要多久？</div>
        </div>
        <div class="answer">
          <p><em style="color: var(--primary);">【待补充：各阶段预估等待时间】</em></p>
          <div class="tip">
            <strong>💡 提示：</strong>生成过程中您可以离开页面，系统会自动保存进度，完成后通知您。
          </div>
        </div>
      </div>
      
      <div class="qa-card">
        <div class="question">
          <div class="q-number">Q18</div>
          <div class="q-text">成片不满意怎么办？</div>
        </div>
        <div class="answer">
          <div class="checklist">
            <div class="checklist-item"><span class="checkbox">✓</span><span>重新生成 — 返回修改脚本或分镜，重新生成视频</span></div>
            <div class="checklist-item"><span class="checkbox">✓</span><span>裂变功能 — 基于当前视频，生成多个变体版本</span></div>
          </div>
        </div>
      </div>
      
      <div class="qa-card">
        <div class="question">
          <div class="q-number">Q19</div>
          <div class="q-text">视频可以导出吗？</div>
        </div>
        <div class="answer">
          <p>可以。在成片页面点击下载按钮，即可导出视频到本地。<em style="color: var(--primary);">【待补充：支持的导出格式】</em></p>
        </div>
      </div>
    </section>
```

- [ ] **步骤 8：添加第六类问题（发布裂变）**

```html
    <!-- 第六类：发布与裂变问题 -->
    <section class="category-section" id="category-publish">
      <h2 class="category-title"><span class="icon">🚀</span> 发布与裂变问题</h2>
      
      <div class="qa-card">
        <div class="question">
          <div class="q-number">Q20</div>
          <div class="q-text">可以发布到哪些平台？</div>
        </div>
        <div class="answer">
          <p><em style="color: var(--primary);">【待补充：支持发布的平台列表，如抖音、快手、小红书】</em></p>
        </div>
      </div>
      
      <div class="qa-card">
        <div class="question">
          <div class="q-number">Q21</div>
          <div class="q-text">裂变功能是什么？</div>
        </div>
        <div class="answer">
          <p>裂变功能可以基于已完成的视频，快速生成多个变体版本。适用于：</p>
          <div class="checklist">
            <div class="checklist-item"><span class="checkbox">✓</span><span>不同风格版本 — 同一服装，不同背景或音乐</span></div>
            <div class="checklist-item"><span class="checkbox">✓</span><span>不同时长版本 — 裁剪成不同长度适应各平台</span></div>
            <div class="checklist-item"><span class="checkbox">✓</span><span>批量生成 — 一次生成多个变体，提高效率</span></div>
          </div>
        </div>
      </div>
    </section>
```

- [ ] **步骤 9：添加第七类问题（准备清单）**

```html
    <!-- 第七类：素材准备清单 -->
    <section class="category-section" id="category-checklist">
      <h2 class="category-title"><span class="icon">📋</span> 素材准备清单</h2>
      
      <div class="qa-card">
        <div class="question">
          <div class="q-number">Q22</div>
          <div class="q-text">有完整的素材准备清单吗？</div>
        </div>
        <div class="answer">
          <p><strong>开始项目前的完整准备清单：</strong></p>
          <table>
            <thead>
              <tr>
                <th>准备项目</th>
                <th>具体要求</th>
                <th>注意事项</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>服装照片</strong></td>
                <td><em style="color: var(--primary);">【待补充】</em></td>
                <td><em style="color: var(--primary);">【待补充】</em></td>
              </tr>
              <tr>
                <td><strong>图片格式</strong></td>
                <td><em style="color: var(--primary);">【待补充】</em></td>
                <td><em style="color: var(--primary);">【待补充】</em></td>
              </tr>
              <tr>
                <td><strong>风格描述</strong></td>
                <td><em style="color: var(--primary);">【待补充】</em></td>
                <td><em style="color: var(--primary);">【待补充】</em></td>
              </tr>
              <tr>
                <td><strong>参考图片</strong></td>
                <td>可选</td>
                <td>有喜欢的风格可以上传参考</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  </div>
```

- [ ] **步骤 10：添加页脚并闭合标签**

```html
  <!-- 页脚 -->
  <footer class="page-footer">
    <p>如有疑问，请联系客服获取帮助</p>
    <p style="margin-top: 8px;">查看 <a href="video-project-guide.html">流程指南版</a> 文档</p>
  </footer>
</body>
</html>
```

- [ ] **步骤 11：验证 HTML 文件创建成功**

运行：`ls -la public/user-guide/`
预期：两个 HTML 文件都存在

---

## 任务 4：验证和提交

- [ ] **步骤 1：检查文件是否存在**

运行：`ls -la public/user-guide/`
预期：显示两个 HTML 文件

- [ ] **步骤 2：提交到 Git**

```bash
git add public/user-guide/
git commit -m "$(cat <<'EOF'
feat: 添加视频项目用户操作指南 HTML 文档

- 新增流程指南版（video-project-guide.html）
- 新增常见问题版（video-project-faq.html）
- 响应式设计，支持手机/平板/电脑浏览
- 待补充业务细节内容
EOF
)"
```

---

## 任务 5：用户提供业务细节

**待用户补充的内容清单：**

| 占位符位置 | 需要提供的内容 |
|-----------|--------------|
| 服装照片拍摄要求 | 光线、背景、角度建议 |
| 每款服装上传数量 | 建议上传几张照片 |
| 图片格式/尺寸要求 | 支持格式、尺寸限制 |
| 定妆风格描述模板 | 常见风格示例列表 |
| 视频生成时间预估 | 各阶段等待时间 |
| 支持的发布平台 | 可发布平台列表 |

用户提供内容后，更新 HTML 文件中的待补充区域。
