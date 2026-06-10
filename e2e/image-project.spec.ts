import { test, expect } from './auth.fixture.js';

/**
 * 图片项目全流程 E2E 测试
 * 覆盖：创建项目 → Step1 服装搭配 → Step2 角色定妆 → Step3 模特图生成 → Step4 电商详情页
 */
test.describe('图片项目全流程', () => {
  test('可以创建图片项目并进入 Step1', async ({ authenticatedPage, apiClient }) => {
    const project = await apiClient.createProject('image');
    const projectId = project.id || project.project?.id;
    expect(projectId).toBeTruthy();

    await authenticatedPage.goto(`/image-create/${projectId}/step1`);
    await expect(authenticatedPage).toHaveURL(new RegExp(`/image-create/${projectId}/step1`));
    // 验证页面加载成功（没有跳转到登录页）
    await expect(authenticatedPage).not.toHaveURL(/\/login/);
  });

  test('Step1 服装搭配页面可访问', async ({ authenticatedPage, apiClient }) => {
    const project = await apiClient.createProject('image');
    const projectId = project.id || project.project?.id;

    await authenticatedPage.goto(`/image-create/${projectId}/step1`);
    await expect(authenticatedPage).toHaveURL(new RegExp(`/image-create/${projectId}/step1`));
    await expect(authenticatedPage).not.toHaveURL(/\/login/);
    // 验证页面有内容加载（body 存在）
    await expect(authenticatedPage.locator('body')).toBeVisible();
  });

  test('Step2 角色定妆页面可访问', async ({ authenticatedPage, apiClient }) => {
    const project = await apiClient.createProject('image');
    const projectId = project.id || project.project?.id;

    await authenticatedPage.goto(`/image-create/${projectId}/step2`);
    await expect(authenticatedPage).toHaveURL(new RegExp(`/image-create/${projectId}/step2`));
    await expect(authenticatedPage).not.toHaveURL(/\/login/);
  });

  test('Step3 模特图生成页面可访问', async ({ authenticatedPage, apiClient }) => {
    const project = await apiClient.createProject('image');
    const projectId = project.id || project.project?.id;

    await authenticatedPage.goto(`/image-create/${projectId}/step3`);
    await expect(authenticatedPage).toHaveURL(new RegExp(`/image-create/${projectId}/step3`));
    await expect(authenticatedPage).not.toHaveURL(/\/login/);
  });

  test('Step4 电商详情页可访问', async ({ authenticatedPage, apiClient }) => {
    const project = await apiClient.createProject('image');
    const projectId = project.id || project.project?.id;

    await authenticatedPage.goto(`/image-create/${projectId}/step4`);
    await expect(authenticatedPage).toHaveURL(new RegExp(`/image-create/${projectId}/step4`));
    await expect(authenticatedPage).not.toHaveURL(/\/login/);
  });
});