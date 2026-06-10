import { type Page, type Locator } from '@playwright/test';

/**
 * Step1 服装上传/搭配 Page Object
 * 使用 data-testid 选择器匹配实际 UI 组件
 */
export class Step1Page {
  readonly page: Page;
  readonly addModuleButton: Locator;
  readonly uploadInput: Locator;
  readonly footerPrimaryAction: Locator;
  readonly backToProjectsButton: Locator;
  readonly mainUploadSlot: Locator;

  constructor(page: Page) {
    this.page = page;
    this.addModuleButton = page.locator('[data-testid="step1-module-add-button"]').first();
    this.uploadInput = page.locator('input[type="file"]').first();
    this.footerPrimaryAction = page.locator('[data-testid="step1-footer-primary-action"]').first();
    this.backToProjectsButton = page.locator('button:has-text("返回我的项目"), a:has-text("返回我的项目")').first();
    // 第一个主图上传区域（使用属性前缀匹配动态 moduleId）
    this.mainUploadSlot = page.locator('[data-testid^="step1-module-main-upload-"]').first();
  }

  async goto(projectId: string, projectKind: 'video' | 'image' | 'outfit' = 'video') {
    const prefix = projectKind === 'video' ? '/create'
      : projectKind === 'image' ? '/image-create'
      : '/outfit-create';
    await this.page.goto(`${prefix}/${projectId}/step1`);
    await this.page.waitForLoadState('networkidle');
  }

  /** 点击"添加服饰"模块按钮 */
  async clickAddModule() {
    await this.addModuleButton.click();
    await this.page.waitForTimeout(500);
  }

  /** 通过 UI 上传服装图片（触发 file chooser 并选择文件） */
  async uploadGarmentImage(filePath: string): Promise<boolean> {
    // 优先找已有的上传槽位
    if (await this.mainUploadSlot.isVisible().catch(() => false)) {
      const [fileChooser] = await Promise.all([
        this.page.waitForEvent('filechooser', { timeout: 5000 }),
        this.mainUploadSlot.click(),
      ]);
      await fileChooser.setFiles(filePath);
      return true;
    }

    // 没有上传槽位则先添加模块
    if (await this.addModuleButton.isVisible().catch(() => false)) {
      await this.clickAddModule();
      await this.page.waitForTimeout(300);

      const newSlot = this.page.locator('[data-testid^="step1-module-main-upload-"]').first();
      if (await newSlot.isVisible().catch(() => false)) {
        const [fileChooser] = await Promise.all([
          this.page.waitForEvent('filechooser', { timeout: 5000 }),
          newSlot.click(),
        ]);
        await fileChooser.setFiles(filePath);
        return true;
      }
    }

    return false;
  }

  /** 点击"下一步"按钮 */
  async clickNextStep() {
    await this.footerPrimaryAction.click();
  }

  /** 点击"返回我的项目" */
  async goBackToProjects() {
    await this.backToProjectsButton.click();
    await this.page.waitForLoadState('networkidle');
  }
}
