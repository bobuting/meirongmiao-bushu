/**
 * Swagger API 文档导出脚本
 *
 * 功能：
 * 1. 创建临时 Fastify 实例并注册所有路由
 * 2. 获取完整 OpenAPI JSON 规范
 * 3. 按 tags 字段拆分为多个 YAML 文件
 * 4. 写入 swagger/ 目录
 *
 * 运行：npm run export-swagger
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { stringify } from 'yaml';

// OpenAPI 文档类型定义
interface OpenApiDoc {
  openapi: string;
  info: {
    title: string;
    version: string;
    description?: string;
  };
  servers?: unknown;
  components?: {
    securitySchemes?: unknown;
    schemas?: unknown;
  };
  security?: unknown;
  paths: Record<string, Record<string, PathSpec>>;
}

interface PathSpec {
  tags?: string[];
  [key: string]: unknown;
}

// OpenAPI 模块与 tags 的映射关系
const MODULE_TAGS_MAP: Record<string, string[]> = {
  'auth.yaml': ['认证'],
  'project-flow.yaml': ['项目流程'],
  'video-step.yaml': ['视频步骤', 'Step1', 'Step2', 'Step3', 'Step4', 'Step5'],
  'library.yaml': ['素材库', '素材'],
  'admin.yaml': ['管理后台', '管理员', 'admin'],
  'square.yaml': ['广场', '公开资源'],
  'video.yaml': ['视频', '视频生成', '音乐'],
  'user.yaml': ['用户'],
  'prompt.yaml': ['提示词', '主题'],
  'static.yaml': ['静态资源'],
};

/**
 * 从完整 OpenAPI 文档中提取指定 tags 的路径
 */
function extractPathsByTags(
  openapiDoc: OpenApiDoc,
  tags: string[]
): Record<string, Record<string, PathSpec>> {
  const filteredPaths: Record<string, Record<string, PathSpec>> = {};

  for (const [path, methods] of Object.entries(openapiDoc.paths || {})) {
    for (const [method, spec] of Object.entries(methods)) {
      // 检查该接口的 tags 是否匹配目标 tags
      const pathTags = spec.tags || [];
      const hasMatchingTag = pathTags.some(tag => tags.includes(tag));

      if (hasMatchingTag) {
        if (!filteredPaths[path]) {
          filteredPaths[path] = {};
        }
        filteredPaths[path][method] = spec;
      }
    }
  }

  return filteredPaths;
}

/**
 * 创建模块化的 OpenAPI 文档
 */
function createModuleDoc(
  fullDoc: OpenApiDoc,
  paths: Record<string, Record<string, PathSpec>>,
  moduleTitle: string
): OpenApiDoc {
  return {
    openapi: fullDoc.openapi,
    info: {
      title: `内容喵 API - ${moduleTitle}`,
      version: fullDoc.info.version,
      description: `${moduleTitle}模块接口文档`,
    },
    servers: fullDoc.servers,
    components: {
      securitySchemes: fullDoc.components?.securitySchemes,
      schemas: fullDoc.components?.schemas,
    },
    security: fullDoc.security,
    paths,
  };
}

/**
 * 主函数：导出 Swagger 文档
 */
async function exportSwagger(): Promise<void> {
  console.log('开始导出 Swagger API 文档...\n');

  // 读取已有的 OpenAPI JSON（需要服务已启动并访问 /docs/json）
  // 这里简化处理：从文件读取或直接使用 swagger() 方法

  // 由于需要完整的服务实例，这里采用替代方案：
  // 直接调用服务的 /docs/json 接口获取规范

  const port = process.env.PORT || '3020';
  const docsJsonUrl = process.env.SWAGGER_JSON_URL || `http://localhost:${port}/docs/json`;

  console.log(`从 ${docsJsonUrl} 获取 OpenAPI 规范...`);

  try {
    const response = await fetch(docsJsonUrl);
    if (!response.ok) {
      throw new Error(`获取 OpenAPI JSON 失败: ${response.status} ${response.statusText}`);
    }

    const openapiDoc = (await response.json()) as OpenApiDoc;
    console.log(`获取成功，包含 ${Object.keys(openapiDoc.paths || {}).length} 个接口\n`);

    // 确保 swagger 目录存在
    const swaggerDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'swagger');
    if (!existsSync(swaggerDir)) {
      mkdirSync(swaggerDir, { recursive: true });
    }

    // 导出完整文档
    const fullYaml = stringify(openapiDoc);
    writeFileSync(join(swaggerDir, 'openapi.yaml'), fullYaml, 'utf-8');
    console.log('✓ 已导出完整文档: swagger/openapi.yaml');

    // 按模块拆分导出
    for (const [filename, tags] of Object.entries(MODULE_TAGS_MAP)) {
      const modulePaths = extractPathsByTags(openapiDoc, tags);

      if (Object.keys(modulePaths).length === 0) {
        console.log(`⊗ ${filename}: 无匹配接口（跳过）`);
        continue;
      }

      // 从文件名提取模块标题
      const moduleTitle = filename.replace('.yaml', '').replace(/-/g, ' ');
      const moduleDoc = createModuleDoc(openapiDoc, modulePaths, moduleTitle);

      const moduleYaml = stringify(moduleDoc);
      writeFileSync(join(swaggerDir, filename), moduleYaml, 'utf-8');
      console.log(`✓ 已导出模块文档: swagger/${filename} (${Object.keys(modulePaths).length} 个接口)`);
    }

    console.log('\n导出完成！');
    console.log('提示: 请确保服务已启动 (npm run dev)，否则无法获取 OpenAPI 规范');

  } catch (error) {
    console.error('导出失败:', error instanceof Error ? error.stack : String(error));
    console.log('\n请先启动服务:');
    console.log('  PERSISTENCE_REQUIRE_READY=false npm run dev');
    console.log('然后运行:');
    console.log('  npm run export-swagger');
    process.exit(1);
  }
}

// 执行导出
exportSwagger().catch(() => process.exit(1));