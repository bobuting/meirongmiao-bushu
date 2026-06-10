import { type Page, type Locator } from '@playwright/test';

/**
 * 登录页 Page Object
 * 模拟用户在登录页的真实操作
 */
export class LoginPage {
  readonly page: Page;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly loginButton: Locator;
  readonly registerLink: Locator;

  constructor(page: Page) {
    this.page = page;
    // 根据实际页面结构选择元素
    this.emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="邮箱"], input[placeholder*="email"]').first();
    this.passwordInput = page.locator('input[type="password"], input[name="password"]').first();
    this.loginButton = page.locator('button[type="submit"], button:has-text("登录"), button:has-text("登 录")').first();
    this.registerLink = page.locator('a:has-text("注册"), button:has-text("注册")').first();
  }

  async goto() {
    await this.page.goto('/login');
    await this.page.waitForLoadState('networkidle');
  }

  async login(email: string, password: string) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.loginButton.click();
    // 等待跳转离开登录页
    await this.page.waitForURL(/\/(dashboard|projects|create)/, { timeout: 15000 });
  }
}