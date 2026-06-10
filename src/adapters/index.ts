// src/adapters/index.ts

/**
 * 数据源适配器导出
 * 提供三源数据（模板、热榜、用户作品）的适配器实现
 */

export { TemplateAdapter } from "./template-adapter.js";
export { HotTrendAdapter } from "./hot-trend-adapter.js";
export { UserWorkAdapter } from "./user-work-adapter.js";