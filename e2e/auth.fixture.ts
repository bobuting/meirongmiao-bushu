import { test as base, type Page } from '@playwright/test';
import { ApiClient } from './helpers/api-client.js';

/**
 * 扩展 Playwright fixture，注入认证和 API 客户端
 */
type E2EFixtures = {
  authenticatedPage: Page;
  apiClient: ApiClient;
  testUserEmail: string;
};

// 每个测试唯一邮箱
let userCounter = 0;

export const test = base.extend<E2EFixtures>({
  testUserEmail: async ({}, use) => {
    userCounter++;
    const email = `e2e-test-${Date.now()}-${userCounter}@test.local`;
    await use(email);
  },

  apiClient: async ({}, use) => {
    const client = new ApiClient();
    await use(client);
  },

  authenticatedPage: async ({ page, apiClient, testUserEmail }, use) => {
    // 注册测试用户
    const password = 'test123456';
    await apiClient.register(testUserEmail, password);
    const loginData = await apiClient.login(testUserEmail, password);

    // 使用 addInitScript 在页面加载前注入 sessionStorage
    await page.addInitScript(({ token, user }) => {
      sessionStorage.setItem('vogue_ai_token', token);
      sessionStorage.setItem('vogue_ai_user', JSON.stringify(user));
    }, { token: loginData.token, user: loginData.user });

    // 导航到需要认证的页面
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    await use(page);
  },
});

export { expect } from '@playwright/test';