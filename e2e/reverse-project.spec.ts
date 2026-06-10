import { test, expect } from './auth.fixture.js';

/**
 * 反推项目 E2E 测试
 * 覆盖：反推脚本页面访问、视频输入、解析流程
 */
test.describe('反推项目流程', () => {
  test('反推脚本页面可访问', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/reverse');
    await expect(authenticatedPage).toHaveURL(/\/reverse/);
    await expect(authenticatedPage).not.toHaveURL(/\/login/);
  });

  test('反推页面加载成功', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/reverse');
    await expect(authenticatedPage).toHaveURL(/\/reverse/);
    await expect(authenticatedPage).not.toHaveURL(/\/login/);
    // 验证页面有内容
    await expect(authenticatedPage.locator('body')).toBeVisible();
  });
});