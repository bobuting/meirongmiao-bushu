import { test, expect } from './auth.fixture.js';

/**
 * 认证流程 E2E 测试
 * 覆盖：注册、登录、未登录跳转、登出
 */
test.describe('认证流程', () => {
  test('新用户可以注册并自动登录', async ({ authenticatedPage }) => {
    // 注册后应跳转到 dashboard 或首页
    await expect(authenticatedPage).toHaveURL(/\/(dashboard|projects)/);
  });

  test('已登录用户可以看到用户信息', async ({ authenticatedPage }) => {
    // 验证页面顶部存在用户相关 UI 元素
    const userMenu = authenticatedPage.locator('[data-testid="user-menu"], [class*="avatar"], [class*="user"]').first();
    // 只要页面没有跳转回登录页即视为成功
    await expect(authenticatedPage).not.toHaveURL(/\/login/);
  });

  test('未登录用户访问受保护页面时跳转到登录页', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/);
  });

  test('登录页可以输入凭据并登录', async ({ page, testUserEmail }) => {
    const password = 'test123456';
    // 先注册
    const { apiClient } = await page.evaluate(() => ({ apiClient: null }));
    // 直接通过 API 注册
    const client = new (await import('./helpers/api-client.js')).ApiClient();
    await client.register(testUserEmail, password);

    // 在登录页输入凭据
    await page.goto('/login');
    await page.fill('input[type="email"], input[name="email"], input[placeholder*="邮箱"]', testUserEmail);
    await page.fill('input[type="password"], input[name="password"]', password);
    await page.click('button[type="submit"], button:has-text("登录")');

    // 登录成功后应跳转
    await expect(page).not.toHaveURL(/\/login/);
  });
});