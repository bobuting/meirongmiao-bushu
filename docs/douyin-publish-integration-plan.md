# 整合 social-auto-upload 到 Step5 一键发布（完整规划）

> 版本: v2 — 2026-03-20
> 状态: 初版已提交 (commit ddf8d96)，本文档描述完整目标与后续迭代

## 1. 背景

当前 Step5 "发布作品"按钮只做：FFmpeg 合成导出视频 + 创建内部 ReviewRequest。没有将视频发布到抖音的能力。

**social-auto-upload**（8.9k stars）用 Playwright 自动化 `creator.douyin.com` 发布页，核心类 `DouYinVideo` 接受 title / file_path / tags / publish_date / account_file / thumbnail_path / productLink / productTitle。

## 2. 方案：Node.js spawn 调用 Python 桥接脚本

在本仓库内新建薄 Python 桥接脚本（`scripts/douyin_publish_bridge.py`），接收 JSON 参数，内部调用 `DouYinVideo`，通过 stdout 返回 JSON 结果。后端用 `child_process.spawn("python", [...])` 异步调用。

**为什么不重写到 Node.js**：social-auto-upload 频繁更新跟进抖音 UI 变化，保持 Python 原生调用可直接 git pull 更新，零维护成本。

## 3. social-auto-upload 关键接口（源码确认）

```python
class DouYinVideo:
    def __init__(self, title, file_path, tags, publish_date, account_file,
                 thumbnail_path=None, productLink='', productTitle=''):
        # title: str，最长 30 字符
        # file_path: str，MP4 绝对路径
        # tags: list[str]，不带 # 前缀
        # publish_date: 0 = 立即发布，datetime = 定时发布
        # account_file: str，Playwright storage_state JSON 路径
        # thumbnail_path: str | None，PNG 封面图路径
        # productLink: str，商品/外部链接 URL（可选）
        # productTitle: str，链接标题（可选）

    async def main(self):  # 执行上传，耗时 1-10 分钟

async def douyin_setup(account_file, handle=False):
    # handle=True 打开浏览器让用户扫码登录
async def cookie_auth(account_file):
    # 返回 True/False
```

## 4. 挂链接策略（来自 release.md 分析）

| 方式 | 说明 | 可靠性 |
|------|------|--------|
| **描述挂 URL** | 标题/描述中直接写 URL，抖音自动识别为可点击蓝色链接 | 高，90% 用户实际用法 |
| **productLink 参数** | DouYinVideo 构造函数原生支持，自动在发布页填写商品链接 | 中，依赖账号权限 |
| **Playwright 模拟"添加链接"按钮** | 在发布流程最后追加 `page.click('text=添加链接')` + 填入 URL | 低，UI 经常变化 |

**本次实现**：
- 前端提供"链接 URL"输入框
- 桥接脚本将 linkUrl 通过两个通道传递：
  1. `productLink` 参数（尝试官方链接卡片）
  2. 附加到 title/描述末尾（兜底，确保链接可见）

## 5. 定时发布

social-auto-upload 原生支持定时发布：`publish_date` 传 `datetime` 对象即为定时，传 `0` 为立即发布。

**前端实现**：
- 添加"发布时间"选择器：立即发布 / 定时发布（日期时间选择）
- publishDate 传递为 Unix timestamp (ms)，桥接脚本转换为 Python datetime

## 6. 实现清单

### Phase 1: Contract ✅ 已完成

`src/contracts/douyin-publish-contract.ts` — PublishJob / DouyinPublishRequest / DouyinPublishResult

### Phase 2: Python 桥接脚本 ✅ 已完成（需增强）

`scripts/douyin_publish_bridge.py`

**待增强**：
- [ ] 支持 `product_link` / `product_title` 参数传递给 DouYinVideo
- [ ] 支持描述兜底挂链接（link_url 附加到 title 末尾）
- [ ] 增加 cookie 有效性预检查并返回明确错误

### Phase 3: 后端发布服务 ✅ 已完成

`src/modules/douyin-publish-service.ts`

### Phase 4: 后端 API 端点 ✅ 已完成

- `POST /projects/:projectId/publish-to-douyin`
- `GET /projects/:projectId/publish-job/:jobId`
- 501 when DOUYIN_PUBLISH_ENABLED=false

### Phase 5: 前端 ✅ 已完成（需增强）

**待增强**：
- [ ] 添加定时发布日期时间选择器
- [ ] 链接输入区分"描述挂链接"和"商品链接卡片"
- [ ] 发布状态增加进度细节（cookie 检查中 → 上传中 → 审核中）
- [ ] 发布历史记录面板（展示该项目所有发布任务）

### Phase 6: 增强桥接脚本（本次迭代目标）

1. **productLink/productTitle 透传**
   - 桥接脚本接收 `product_link` 和 `product_title` 字段
   - 传递给 DouYinVideo 构造函数

2. **描述兜底挂链接**
   - 当 `link_url` 非空时，自动附加到 title 末尾
   - 格式: `{title}\n{link_url}`

3. **定时发布支持**
   - `publish_date` > 0 时转换为 `datetime.fromtimestamp(publish_date / 1000)`
   - 验证定时时间不早于当前时间 + 10 分钟

### Phase 7: 前端定时发布 & 链接增强（本次迭代目标）

1. **发布时间选择**
   - 单选：立即发布（默认）/ 定时发布
   - 定时发布：显示日期时间选择器
   - publishDate 以 Unix timestamp ms 传递

2. **链接输入增强**
   - "描述挂链接 URL"输入框（附加到标题/描述）
   - "商品链接"输入框 + "商品标题"输入框（传 productLink/productTitle）
   - 提示文案：描述挂链接最稳定，商品链接需要账号权限

## 7. 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `DOUYIN_PUBLISH_ENABLED` | 是否启用抖音发布功能 | `false` |
| `SOCIAL_AUTO_UPLOAD_DIR` | social-auto-upload 仓库本地路径 | 空 |
| `DOUYIN_COOKIE_FILE` | Playwright cookie JSON 文件路径 | 空 |

## 8. 关键文件清单

| 操作 | 文件 |
|------|------|
| ✅ 已建 | `src/contracts/douyin-publish-contract.ts` |
| ✅ 已建 | `src/modules/douyin-publish-service.ts` |
| ✅ 已建 | `scripts/douyin_publish_bridge.py` |
| ✅ 已改 | `src/core/app-context.ts` |
| ✅ 已改 | `src/core/runtime-config.ts` |
| ✅ 已改 | `src/app.ts` |
| ✅ 已改 | `apps/web/services/backendApi.ts` |
| ✅ 已改 | `apps/web/.../step5DeliveryActionController.ts` |
| ✅ 已改 | `apps/web/.../Step5DeliveryShellRoute.tsx` |
| ✅ 已改 | `.env.example` |

## 9. 前置条件（不在实现范围内）

1. `git clone https://github.com/dreammis/social-auto-upload.git` 到本地
2. `pip install -r requirements.txt && playwright install chromium`
3. 首次运行 `python examples/get_douyin_cookie.py` 手动扫码登录，生成 cookie 文件

## 10. 验证

1. `DOUYIN_PUBLISH_ENABLED=false` 时：抖音发布 UI 隐藏，不影响现有下载/审核流程
2. `DOUYIN_PUBLISH_ENABLED=true` 时：
   - Step5 点击"发布到抖音" → 后端创建 job → spawn Python → 前端轮询状态
   - 定时发布：设置未来时间 → 抖音发布页显示定时
   - 挂链接：描述中出现可点击蓝色链接
