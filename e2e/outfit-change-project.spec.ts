import { test, expect } from './auth.fixture.js';

/**
 * 换装项目全流程 E2E 测试
 * 覆盖：Step1 选择视频 → Step2 选择服装 → Step3 换装处理 → Step4 结果导出
 */
test.describe('换装项目全流程', () => {
  test('可以创建换装项目并进入 Step1', async ({ authenticatedPage, apiClient }) => {
    const project = await apiClient.createProject('outfit_change');
    const projectId = project.id || project.project?.id;
    expect(projectId).toBeTruthy();

    await authenticatedPage.goto(`/outfit-create/${projectId}/step1`);
    await expect(authenticatedPage).toHaveURL(new RegExp(`/outfit-create/${projectId}/step1`));
    await expect(authenticatedPage).not.toHaveURL(/\/login/);
  });

  test('Step1 选择视频页面可访问', async ({ authenticatedPage, apiClient }) => {
    const project = await apiClient.createProject('outfit_change');
    const projectId = project.id || project.project?.id;

    await authenticatedPage.goto(`/outfit-create/${projectId}/step1`);
    await expect(authenticatedPage).toHaveURL(new RegExp(`/outfit-create/${projectId}/step1`));
    await expect(authenticatedPage).not.toHaveURL(/\/login/);
    await expect(authenticatedPage.locator('body')).toBeVisible();
  });

  test('Step2 选择服装页面可访问', async ({ authenticatedPage, apiClient }) => {
    const project = await apiClient.createProject('outfit_change');
    const projectId = project.id || project.project?.id;

    await authenticatedPage.goto(`/outfit-create/${projectId}/step2`);
    await expect(authenticatedPage).toHaveURL(new RegExp(`/outfit-create/${projectId}/step2`));
    await expect(authenticatedPage).not.toHaveURL(/\/login/);
  });

  test('Step3 换装处理页面可访问', async ({ authenticatedPage, apiClient }) => {
    const project = await apiClient.createProject('outfit_change');
    const projectId = project.id || project.project?.id;

    await authenticatedPage.goto(`/outfit-create/${projectId}/step3`);
    await expect(authenticatedPage).toHaveURL(new RegExp(`/outfit-create/${projectId}/step3`));
    await expect(authenticatedPage).not.toHaveURL(/\/login/);
  });

  test('Step4 结果导出页面可访问', async ({ authenticatedPage, apiClient }) => {
    const project = await apiClient.createProject('outfit_change');
    const projectId = project.id || project.project?.id;

    await authenticatedPage.goto(`/outfit-create/${projectId}/step4`);
    await expect(authenticatedPage).toHaveURL(new RegExp(`/outfit-create/${projectId}/step4`));
    await expect(authenticatedPage).not.toHaveURL(/\/login/);
  });
});