import { type Page, type Locator } from '@playwright/test';

/**
 * Step2 角色定妆 Page Object
 */
export class Step2Page {
  readonly page: Page;
  readonly characterCards: Locator;
  readonly confirmButton: Locator;
  readonly regenerateButton: Locator;
  readonly backButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.characterCards = page.locator('[data-testid*="step2-role"], [class*="character-card"], [class*="candidate"]').first();
    this.confirmButton = page.locator('button:has-text("确认"), button:has-text("使用此角色"), button:has-text("下一步")').first();
    this.regenerateButton = page.locator('button:has-text("重新生成"), button:has-text("换一批")').first();
    this.backButton = page.locator('button:has-text("返回"), button:has-text("上一步")').first();
  }

  async goto(projectId: string) {
    await this.page.goto(`/create/${projectId}/step2`);
    await this.page.waitForLoadState('networkidle');
  }

  async selectFirstCharacter() {
    // 等待角色卡片出现
    await this.page.waitForTimeout(2000);
    const firstCard = this.page.locator('[data-testid*="step2-role"], [class*="character-card"], [class*="candidate"]').first();
    if (await firstCard.isVisible()) {
      await firstCard.click();
    }
  }

  async confirmAndNext() {
    await this.confirmButton.click();
    await this.page.waitForTimeout(1000);
  }
}