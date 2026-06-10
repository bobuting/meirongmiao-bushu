import { APIRequestContext, request as playwrightRequest } from '@playwright/test';

/**
 * E2E 测试 API 客户端
 * 直接调用后端 API，跳过前端 UI，用于快速准备测试数据
 */
export class ApiClient {
  private baseUrl: string;
  private token: string | null = null;
  private requestContext: APIRequestContext | null = null;

  constructor(baseUrl = 'http://localhost:3020') {
    this.baseUrl = baseUrl;
  }

  private async getRequestContext(): Promise<APIRequestContext> {
    if (!this.requestContext) {
      this.requestContext = await playwrightRequest.newContext({
        baseURL: this.baseUrl,
      });
    }
    return this.requestContext;
  }

  setToken(token: string) {
    this.token = token;
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }
    return headers;
  }

  async post(path: string, body: Record<string, unknown>) {
    const req = await this.getRequestContext();
    const response = await req.post(path, {
      data: body,
      headers: this.getHeaders(),
    });
    return response;
  }

  async get(path: string) {
    const req = await this.getRequestContext();
    const response = await req.get(path, {
      headers: this.getHeaders(),
    });
    return response;
  }

  async patch(path: string, body: Record<string, unknown>) {
    const req = await this.getRequestContext();
    const response = await req.patch(path, {
      data: body,
      headers: this.getHeaders(),
    });
    return response;
  }

  async delete(path: string) {
    const req = await this.getRequestContext();
    const response = await req.delete(path, {
      headers: this.getHeaders(),
    });
    return response;
  }

  async uploadFile(path: string, fieldName: string, filePath: string, extraFields?: Record<string, string>) {
    const req = await this.getRequestContext();
    const response = await req.post(path, {
      multipart: {
        [fieldName]: {
          name: filePath.split('/').pop() || 'file',
          mimeType: 'image/png',
          buffer: Buffer.from('test-image-content'),
        },
        ...extraFields,
      },
      headers: this.token ? { Authorization: `Bearer ${this.token}` } : {},
    });
    return response;
  }

  // ===== 认证 =====

  async register(email: string, password: string) {
    const res = await this.post('/neirongmiao/api/auth/register', { email, password });
    return res.json();
  }

  async login(email: string, password: string) {
    const res = await this.post('/neirongmiao/api/auth/login', { email, password });
    const data = await res.json();
    if (data.token) {
      this.setToken(data.token);
    }
    return data;
  }

  // ===== 项目 =====

  async createProject(projectKind: 'video' | 'image' | 'reverse' | 'outfit_change' = 'video', name?: string) {
    const res = await this.post('/neirongmiao/api/projects', {
      projectKind,
      name: name || `E2E测试项目-${Date.now()}`,
    });
    return res.json();
  }

  async getProject(projectId: string) {
    const res = await this.get(`/neirongmiao/api/projects/${projectId}`);
    return res.json();
  }

  async deleteProject(projectId: string) {
    const res = await this.delete(`/neirongmiao/api/projects/${projectId}`);
    return res.json();
  }

  async getProjectContext(projectId: string) {
    const res = await this.get(`/neirongmiao/api/projects/${projectId}/context`);
    return res.json();
  }
}