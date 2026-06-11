import path from 'path';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Vite 插件：阻止后端 Node.js 模块被打包到前端
 * 解决前端通过 import type 导入后端类型定义时，Vite 仍尝试解析后端运行时依赖的问题
 */
function excludeBackendModules(): Plugin {
  const backendModulePatterns = [
    /src\/modules\/prompt/,
    /src\/persistence\/prompt/,
    /src\/persistence$/,
  ];

  return {
    name: 'exclude-backend-modules',
    enforce: 'pre',
    resolveId(source, importer) {
      // 检查导入路径是否匹配后端模块
      for (const pattern of backendModulePatterns) {
        if (source.includes('prompt-service') || source.includes('prompt-helper') || source.includes('prompt-persistence')) {
          // 返回虚拟模块 ID（不标记 external，让 load 钩子处理）
          return 'virtual:backend-module-stub';
        }
        // 检查 importer 是否来自后端模块（防止链式导入）
        if (importer && pattern.test(importer)) {
          return 'virtual:backend-module-stub';
        }
      }
      return null;
    },
    load(id) {
      // 为虚拟模块提供空实现
      if (id === 'virtual:backend-module-stub') {
        return 'export default {}; export const getPromptContent = async () => ({ prompt: "", templateId: "", version: 0, systemPrompt: "", userPrompt: "" }); export const buildPrompt = async () => ({ systemPrompt: "", userPrompt: "" });';
      }
      return null;
    },
  };
}

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        fs: {
          // 允许访问项目根目录的 node_modules 和 src
          allow: [path.resolve(__dirname, '..'), path.resolve(__dirname, '../../src')]
        },
        // COOP/COEP headers 已移除：ffmpeg.wasm 使用单线程模式无需 SharedArrayBuffer

        proxy: {
          '/neirongmiao/api': {
            target: 'http://localhost:3020',
            changeOrigin: true,
            timeout: 5 * 60 * 1000, // 反推等长耗时接口需要足够超时（5 分钟）
          },
          // 对象存储静态资源代理（图片下载需要）
          '/storage': {
            target: 'http://localhost:3020',
            changeOrigin: true,
          }
        }
      },
      // 先应用排除插件，再应用 react 插件
      plugins: [excludeBackendModules(), react()],
      define: {
        // 注意：不再将 API Key 暴露到前端 bundle，改用后端代理
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
          '@shared': path.resolve(__dirname, '../../src/contant-config'),
          '@contracts': path.resolve(__dirname, '../../src/contracts'),
        }
      },
      // 排除后端 Node.js 模块，避免前端构建时包含数据库依赖
      optimizeDeps: {
        exclude: [
          '../../src/modules/prompt',
          '../../src/persistence',
        ],
      },
      // 分包配置：将大型依赖拆分为独立 chunk
      build: {
        // 禁用 HTML 内联 CSS 代理模块（Vite 6 已知问题）
        html: {
          inlineCSS: false,
        },
        rollupOptions: {
          output: {
            manualChunks: {
              // React 核心全家桶
              'vendor-react': ['react', 'react-dom', 'react-router'],
              // 状态管理与数据请求
              'vendor-state': ['zustand', '@tanstack/react-query'],
              // 视频处理引擎
              'mediabunny': ['mediabunny'],
              // 工具库
              'vendor-utils': ['chroma-js'],
            },
          },
        },
        // 分包后单个 chunk 超过 1MB 才警告
        chunkSizeWarningLimit: 1000,
      },
    };
});
