import { type Page, type Locator } from '@playwright/test';

/**
 * 项目列表/首页 Page Object
 * 模拟用户在项目列表页的操作
 */
export class ProjectListPage {
  readonly page: Page;
  readonly createVideoButton: Locator;
  readonly createImageButton: Locator;
  readonly createOutfitButton: Locator;
  readonly projectCards: Locator;

  constructor(page: Page) {
    this.page = page;
    this.createVideoButton = page.locator('button:has-text("视频"), a:has-text("视频"), [data-testid="create-video"]').first();
    this.createImageButton = page.locator('button:has-text("图片"), a:has-text("图片"), [data-testid="create-image"]').first();
    this.createOutfitButton = page.locator('button:has-text("换装"), a:has-text("换装"), [data-testid="create-outfit"]').first();
    this.projectCards = page.locator('[data-testid="project-card"], [class*="project-card"], [class*="ProjectCard"]').first();
  }

  async goto() {
    await this.page.goto('/dashboard');
    await this.page.waitForLoadState('networkidle');
  }

  async createVideoProject() {
    await this.createVideoButton.click();
    await this.page.waitForURL(/\/create/, { timeout: 10000 });
  }
}