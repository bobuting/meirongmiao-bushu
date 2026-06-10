import { test, expect } from './auth.fixture.js';

/**
 * 视频项目全流程 E2E 测试
 * 覆盖：创建项目 → Step1 服装上传/搭配 → Step2 定妆 → Step3 脚本分镜 → Step4 视频 → Step5 发布 → Step6 裂变
 *
 * 注意：LLM 生成和视频渲染属于长耗时操作，E2E 测试仅验证 UI 交互流程和页面可达性，
 * 不等待实际 AI 生成结果。LLM 调用的正确性由后端集成测试覆盖。
 */
test.describe('视频项目全流程', () => {
  test('可以创建视频项目并进入 Step1', async ({ authenticatedPage, apiClient }) => {
    // 通过 API 创建项目
    const project = await apiClient.createProject('video');
    expect(project).toBeDefined();
    expect(project.id || project.project?.id).toBeTruthy();

    const projectId = project.id || project.project?.id;

    // 访问项目 Step1 页面
    await authenticatedPage.goto(`/create/${projectId}/step1`);
    await expect(authenticatedPage).toHaveURL(new RegExp(`/create/${projectId}/step1`));
    await expect(authenticatedPage).not.toHaveURL(/\/login/);
  });

  test('Step1 页面可访问', async ({ authenticatedPage, apiClient }) => {
    const project = await apiClient.createProject('video');
    const projectId = project.id || project.project?.id;

    await authenticatedPage.goto(`/create/${projectId}/step1`);
    await expect(authenticatedPage).toHaveURL(new RegExp(`/create/${projectId}/step1`));
    await expect(authenticatedPage).not.toHaveURL(/\/login/);
    // 验证页面有内容加载
    await expect(authenticatedPage.locator('body')).toBeVisible();
  });

  test('Step1 → Step2 页面导航', async ({ authenticatedPage, apiClient }) => {
    const project = await apiClient.createProject('video');
    const projectId = project.id || project.project?.id;

    // 进入 Step1
    await authenticatedPage.goto(`/create/${projectId}/step1`);
    await expect(authenticatedPage).not.toHaveURL(/\/login/);

    // 直接导航到 Step2 验证页面可达
    await authenticatedPage.goto(`/create/${projectId}/step2`);
    await expect(authenticatedPage).toHaveURL(new RegExp(`/create/${projectId}/step2`));
    await expect(authenticatedPage).not.toHaveURL(/\/login/);
  });

  test('Step2 定妆页面可访问', async ({ authenticatedPage, apiClient }) => {
    const project = await apiClient.createProject('video');
    const projectId = project.id || project.project?.id;

    await authenticatedPage.goto(`/create/${projectId}/step2`);
    await expect(authenticatedPage).toHaveURL(new RegExp(`/create/${projectId}/step2`));
    await expect(authenticatedPage).not.toHaveURL(/\/login/);
    await expect(authenticatedPage.locator('body')).toBeVisible();
  });

  test('Step3 脚本分镜页面可访问', async ({ authenticatedPage, apiClient }) => {
    const project = await apiClient.createProject('video');
    const projectId = project.id || project.project?.id;

    await authenticatedPage.goto(`/create/${projectId}/step3`);
    await expect(authenticatedPage).toHaveURL(new RegExp(`/create/${projectId}/step3`));
    await expect(authenticatedPage).not.toHaveURL(/\/login/);
  });

  test('Step4 视频生成页面可访问', async ({ authenticatedPage, apiClient }) => {
    const project = await apiClient.createProject('video');
    const projectId = project.id || project.project?.id;

    await authenticatedPage.goto(`/create/${projectId}/step4`);
    await expect(authenticatedPage).toHaveURL(new RegExp(`/create/${projectId}/step4`));
    await expect(authenticatedPage).not.toHaveURL(/\/login/);
  });

  test('Step5 发布页面可访问', async ({ authenticatedPage, apiClient }) => {
    const project = await apiClient.createProject('video');
    const projectId = project.id || project.project?.id;

    await authenticatedPage.goto(`/create/${projectId}/step5`);
    await expect(authenticatedPage).toHaveURL(new RegExp(`/create/${projectId}/step5`));
    await expect(authenticatedPage).not.toHaveURL(/\/login/);
  });

  test('Step6 裂变页面可访问', async ({ authenticatedPage, apiClient }) => {
    const project = await apiClient.createProject('video');
    const projectId = project.id || project.project?.id;

    await authenticatedPage.goto(`/create/${projectId}/step6`);
    await expect(authenticatedPage).toHaveURL(new RegExp(`/create/${projectId}/step6`));
    await expect(authenticatedPage).not.toHaveURL(/\/login/);
  });

  test('可以删除视频项目', async ({ authenticatedPage, apiClient }) => {
    const project = await apiClient.createProject('video');
    const projectId = project.id || project.project?.id;

    // 通过 API 删除
    const res = await apiClient.deleteProject(projectId);
    expect(res).toBeDefined();
  });
});