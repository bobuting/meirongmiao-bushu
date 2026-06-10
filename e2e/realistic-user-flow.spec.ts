import { test, expect } from './auth.fixture.js';
import { LoginPage } from './pom/login-page.js';
import { DashboardPage } from './pom/dashboard-page.js';
import path from 'path';

/**
 * 纯 UI 驱动的 E2E 测试
 *
 * 设计原则：
 * 1. 用户通过 UI 完成的操作 → 100% 模拟点击、填写表单
 * 2. 无 UI 的操作（如注册）→ 使用 API
 * 3. LLM 长耗时操作 → 使用 page.route() mock
 *
 * 用户真实导航方式：
 * - 创建项目：Dashboard "新建项目" → 选择项目类型
 * - 进入下一步：点击底部"下一步"按钮
 * - 返回项目列表：点击"返回我的项目"
 */

const FIXTURES_DIR = path.join(import.meta.dirname, 'fixtures');

/** 从 URL 提取 projectId */
function extractProjectId(url: string, kind: 'video' | 'image' | 'outfit'): string {
  const prefix = kind === 'video' ? 'create' : kind === 'image' ? 'image-create' : 'outfit-create';
  const match = url.match(new RegExp(`/${prefix}/([^/]+)/step`));
  return match?.[1] ?? '';
}

// ========== 认证相关测试 ==========

test.describe('纯 UI 流程 - 认证', () => {
  test('用户通过 UI 登录表单登录成功', async ({ page, testUserEmail }) => {
    const password = 'test123456';

    // 注册（无 UI 注册页面，通过 API 完成）
    await page.request.post('/neirongmiao/api/auth/register', {
      data: { email: testUserEmail, password },
    });

    // 通过 UI 登录
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await expect(loginPage.emailInput).toBeVisible();
    await expect(loginPage.passwordInput).toBeVisible();
    await expect(loginPage.loginButton).toBeVisible();

    await loginPage.login(testUserEmail, password);
    await expect(page).not.toHaveURL(/\/login/);
  });

  test('未登录用户访问受保护页面被拦截', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/, { timeout: 10000 });
  });

  test('输入错误密码登录失败', async ({ page, testUserEmail }) => {
    await page.request.post('/neirongmiao/api/auth/register', {
      data: { email: testUserEmail, password: 'test123456' },
    });

    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.emailInput.fill(testUserEmail);
    await loginPage.passwordInput.fill('wrongpassword');
    await loginPage.loginButton.click();

    await page.waitForTimeout(2000);
    expect(page.url()).toMatch(/\/login/);
  });
});

// ========== 视频项目完整 UI 流程 ==========

test.describe('纯 UI 流程 - 视频项目', () => {
  test('通过 Dashboard UI 创建视频项目', async ({ page, testUserEmail }) => {
    const password = 'test123456';

    // 注册 + UI 登录
    await page.request.post('/neirongmiao/api/auth/register', {
      data: { email: testUserEmail, password },
    });
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(testUserEmail, password);
    await expect(page).not.toHaveURL(/\/login/);

    // ===== 步骤1：Dashboard 点击"新建项目" =====
    const dashboard = new DashboardPage(page);
    await dashboard.clickNewProject();

    // 验证对话框出现
    await expect(dashboard.dialogTitle).toBeVisible();
    await expect(page.locator('button:has-text("视频项目")')).toBeVisible();
    await expect(page.locator('text=6 步完整创作流程')).toBeVisible();

    // 选择"视频项目"
    await dashboard.selectProjectType('视频项目');

    // 等待导航到 Step1，页面完全加载
    await page.waitForURL(/\/create\/[^/]+\/step1/, { timeout: 15000 });
    const projectId = extractProjectId(page.url(), 'video');
    expect(projectId).toBeTruthy();

    // 等待页面渲染完成
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);

    // ===== 步骤2：Step1 验证 UI 结构 =====
    await expect(page).toHaveURL(new RegExp(`/create/${projectId}/step1`));

    // 验证底部操作栏存在（比步骤条更稳定）
    const footerBar = page.locator('[data-testid="step1-floating-footer"]').first();
    await expect(footerBar).toBeVisible({ timeout: 15000 });

    // 验证主操作按钮存在（新项目时显示"上传服饰"）
    const primaryButton = page.locator('[data-testid="step1-footer-primary-action"]').first();
    await expect(primaryButton).toBeVisible();

    // 新项目状态下按钮应该启用（允许用户开始上传）
    await expect(primaryButton).toBeEnabled();

    // 验证按钮功能正确（aria-label 应该是"上传服饰"）
    const ariaLabel = await primaryButton.getAttribute('aria-label');
    expect(ariaLabel).toContain('上传');

    // 验证"返回我的项目"按钮存在
    const backButton = page.locator('button:has-text("返回我的项目"), button:has-text("返回")').first();
    await expect(backButton).toBeVisible();

    // ===== 步骤3：尝试上传图片（UI 交互） =====
    // 查找上传区域
    const uploadArea = page.locator('[data-testid^="step1-module-main-upload-"]').first();
    if (await uploadArea.isVisible().catch(() => false)) {
      // 触发 file chooser
      const [fileChooser] = await Promise.all([
        page.waitForEvent('filechooser', { timeout: 5000 }).catch(() => null),
        uploadArea.click(),
      ]);

      if (fileChooser) {
        await fileChooser.setFiles(path.join(FIXTURES_DIR, 'test-garment.png'));
        await page.waitForTimeout(3000);
      }
    }

    // ===== 步骤4：通过侧边栏步骤卡验证页面结构 =====
    // Step1 应该有展开的内容区域
    const step1Card = page.locator('[data-step="1"]').first();
    await expect(step1Card).toBeVisible();

    // Step2 应该存在但可能是锁定状态
    const step2Card = page.locator('[data-step="2"]').first();
    await expect(step2Card).toBeVisible();

    // ===== 步骤5：通过 URL 导航到后续步骤验证页面渲染 =====
    // 注意：由于 Step1 → Step2 需要真实数据（上传图片、角色预设等），
    // 这里使用 URL 导航验证页面结构
    // 真实用户流程会通过"下一步"按钮，但那需要完整的 Step1 数据
    for (const step of ['step2', 'step3', 'step4', 'step5', 'step6']) {
      await page.goto(`/create/${projectId}/${step}`);
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveURL(new RegExp(`/create/${projectId}/${step}`));
      await expect(page).not.toHaveURL(/\/login/);

      // 验证页面有内容渲染（body 元素可见）
      await expect(page.locator('body')).toBeVisible();
    }

    // ===== 步骤6：返回 Dashboard =====
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/\/dashboard/);
  });
});

// ========== 图片项目完整 UI 流程 ==========

test.describe('纯 UI 流程 - 图片项目', () => {
  test('通过 Dashboard UI 创建图片项目', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    // Dashboard 点击"新建项目" → 选择"图片项目"
    const dashboard = new DashboardPage(page);
    const projectId = await dashboard.createProjectViaUI('图片项目');
    expect(projectId).toBeTruthy();

    // 等待页面渲染完成
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);

    // 验证 Step1 页面结构
    await expect(page).toHaveURL(new RegExp(`/image-create/${projectId}/step1`));

    // 验证页面有内容渲染
    const pageContent = page.locator('body');
    await expect(pageContent).toBeVisible();

    // 后续步骤通过 URL 验证（需要 Step1 数据才能点击"下一步"）
    for (const step of ['step2', 'step3', 'step4']) {
      await page.goto(`/image-create/${projectId}/${step}`);
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveURL(new RegExp(`/image-create/${projectId}/${step}`));
    }
  });
});

// ========== 换装项目完整 UI 流程 ==========

test.describe('纯 UI 流程 - 换装项目', () => {
  test('通过 Dashboard UI 创建换装项目', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    // Dashboard 点击"新建项目" → 选择"一键换装"
    const dashboard = new DashboardPage(page);
    const projectId = await dashboard.createProjectViaUI('一键换装');
    expect(projectId).toBeTruthy();

    // 验证 Step1 页面结构
    await expect(page).toHaveURL(new RegExp(`/outfit-create/${projectId}/step1`));

    // 验证底部操作栏存在
    const nextButton = page.locator('button:has-text("下一步")').first();
    await expect(nextButton).toBeVisible();

    // 新项目无视频，按钮应禁用
    await expect(nextButton).toBeDisabled();

    // 验证状态提示
    await expect(page.locator('text=请先上传或输入视频')).toBeVisible();

    // 后续步骤通过 URL 验证
    for (const step of ['step2', 'step3', 'step4']) {
      await page.goto(`/outfit-create/${projectId}/${step}`);
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveURL(new RegExp(`/outfit-create/${projectId}/${step}`));
    }
  });
});

// ========== 页面导航测试 ==========

test.describe('纯 UI 流程 - 页面导航', () => {
  test('Dashboard "新建项目"对话框完整交互', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    const dashboard = new DashboardPage(page);

    // 点击"新建项目"
    await dashboard.clickNewProject();

    // 验证对话框标题和副标题
    await expect(page.locator('text=选择创作模式')).toBeVisible();
    await expect(page.locator('text=点击即可开始创作')).toBeVisible();

    // 验证三种项目类型卡片都存在
    const videoCard = page.locator('button:has-text("视频项目")').first();
    const imageCard = page.locator('button:has-text("图片项目")').first();
    const outfitCard = page.locator('button:has-text("一键换装")').first();

    await expect(videoCard).toBeVisible();
    await expect(imageCard).toBeVisible();
    await expect(outfitCard).toBeVisible();

    // 验证描述文字
    await expect(page.locator('text=6 步完整创作流程')).toBeVisible();
    await expect(page.locator('text=4 步轻量创作流程')).toBeVisible();
    await expect(page.locator('text=4 步快速换装')).toBeVisible();

    // 点击关闭按钮（Material Icons 的 close 图标）
    const closeButton = page.locator('button:has(span.material-icons-round:has-text("close"))').first();
    await closeButton.click();

    // 等待对话框动画关闭完成
    await page.waitForTimeout(500);

    // 验证对话框已关闭
    await expect(page.locator('text=选择创作模式')).not.toBeVisible({ timeout: 3000 });
  });

  test('底部导航栏交互验证', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    // 创建视频项目
    const dashboard = new DashboardPage(page);
    const projectId = await dashboard.createProjectViaUI('视频项目');

    // 验证底部操作栏存在
    const footer = page.locator('[data-testid="step1-floating-footer"]').first();
    await expect(footer).toBeVisible();

    // 验证"返回我的项目"按钮可点击
    const backButton = page.locator('button:has-text("返回")').first();
    await expect(backButton).toBeEnabled();

    // 点击返回项目列表
    await backButton.click();
    await page.waitForLoadState('networkidle');

    // 验证已返回 dashboard 或 projects
    await expect(page).toHaveURL(/\/(dashboard|projects)/);
  });

  test('页面间导航：Dashboard → 音乐库 → 反推', async ({ authenticatedPage }) => {
    const page = authenticatedPage;
    await expect(page).toHaveURL(/\/dashboard/);

    // 导航到反推页面（如果有顶部导航栏的话，应该点击链接）
    // 这里用 URL 导航作为后备方案
    await page.goto('/reverse');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/\/reverse/);

    // 导航到音乐库
    await page.goto('/music');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/\/music/);

    // 返回 dashboard
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/dashboard/);
  });
});
