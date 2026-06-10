import { type Page, type Locator } from '@playwright/test';

/**
 * Dashboard/Square 页面 Page Object
 * 模拟用户在 Dashboard 的真实操作：新建项目、浏览项目列表
 */
export class DashboardPage {
  readonly page: Page;
  readonly newProjectButton: Locator;
  readonly dialogTitle: Locator;
  readonly videoCard: Locator;
  readonly imageCard: Locator;
  readonly outfitCard: Locator;

  constructor(page: Page) {
    this.page = page;
    // 固定在右下角的"新建项目"按钮
    this.newProjectButton = page.locator('button:has-text("新建项目")').first();
    // 对话框标题
    this.dialogTitle = page.locator('text=选择创作模式');
    // 三种项目类型卡片
    this.videoCard = page.locator('button:has-text("视频项目")').first();
    this.imageCard = page.locator('button:has-text("图片项目")').first();
    this.outfitCard = page.locator('button:has-text("一键换装")').first();
  }

  async goto() {
    await this.page.goto('/dashboard');
    await this.page.waitForLoadState('networkidle');
  }

  /** 点击右下角"新建项目"按钮，等待对话框出现 */
  async clickNewProject() {
    await this.newProjectButton.click();
    await this.dialogTitle.waitFor({ state: 'visible', timeout: 5000 });
  }

  /** 在对话框中选择项目类型 */
  async selectProjectType(typeLabel: '视频项目' | '图片项目' | '一键换装') {
    const card = this.page.locator(`button:has-text("${typeLabel}")`).first();
    await card.click();
  }

  /** 完整 UI 创建项目流程：点击新建 → 选择类型 → 等待导航到 Step1 */
  async createProjectViaUI(typeLabel: '视频项目' | '图片项目' | '一键换装'): Promise<string> {
    await this.clickNewProject();
    await this.selectProjectType(typeLabel);

    // 根据项目类型匹配不同的 URL 模式
    const urlPattern = typeLabel === '视频项目' ? /\/create\/[^/]+\/step1/
      : typeLabel === '图片项目' ? /\/image-create\/[^/]+\/step1/
      : /\/outfit-create\/[^/]+\/step1/;

    await this.page.waitForURL(urlPattern, { timeout: 15000 });

    const url = this.page.url();
    const match = url.match(/\/(?:create|image-create|outfit-create)\/([^/]+)\/step1/);
    return match?.[1] ?? '';
  }
}
