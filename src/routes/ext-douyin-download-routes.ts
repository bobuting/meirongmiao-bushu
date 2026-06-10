/** Chrome 扩展下载路由 */

import type { FastifyInstance } from "fastify";
import { createReadStream } from "fs";
import { existsSync } from "fs";
import { join } from "path";
import type { AppContext } from "../core/app-context.js";

interface ExtensionDownloadRoutesDeps {
  ctx: AppContext;
}

export function registerExtensionDownloadRoutes(
  app: FastifyInstance,
  deps: ExtensionDownloadRoutesDeps
): void {
  const { ctx } = deps;

  /**
   * 下载 Chrome 扩展 ZIP 包
   * GET /ext/douyin/download
   */
  app.get("/ext/douyin/download", async (request, reply) => {
    const extensionDistPath = join(process.cwd(), "apps", "douyin-publisher-extension", "dist");
    const zipPath = join(process.cwd(), "apps", "douyin-publisher-extension", "extension.zip");

    // 检查 ZIP 包是否存在，不存在则动态打包
    if (!existsSync(zipPath)) {
      // 如果 dist 目录不存在，返回错误
      if (!existsSync(extensionDistPath)) {
        return reply.status(404).send({
          code: "EXTENSION_NOT_BUILT",
          message: "扩展未构建，请先运行：cd apps/douyin-publisher-extension && npm run build",
        });
      }

      // 动态打包（使用系统 zip 命令）
      const { execSync } = await import("child_process");
      try {
        execSync(`cd "${extensionDistPath}" && zip -r "${zipPath}" .`, { encoding: "utf-8" });
      } catch (error) {
        return reply.status(500).send({
          code: "ZIP_FAILED",
          message: "打包扩展失败，请手动打包：cd apps/douyin-publisher-extension/dist && zip -r ../extension.zip .",
        });
      }
    }

    // 设置下载响应头
    reply.header("Content-Type", "application/zip");
    reply.header("Content-Disposition", "attachment; filename=neirongmiao-douyin-extension.zip");
    reply.header("Cache-Control", "no-cache");

    // 流式传输 ZIP 文件
    const stream = createReadStream(zipPath);
    stream.on("error", (err) => {
      reply.status(500).send({ error: `读取文件失败: ${err.message}` });
    });
    return reply.send(stream);
  });

  /**
   * 获取扩展安装教程（JSON 格式）
   * GET /ext/douyin/install-guide
   */
  app.get("/ext/douyin/install-guide", async (request, reply) => {
    return reply.send({
      code: "SUCCESS",
      data: {
        steps: [
          {
            step: 1,
            title: "下载扩展 ZIP 包",
            description: "点击上方按钮下载扩展包，ZIP 文件包含所有必需文件。",
            icon: "download",
          },
          {
            step: 2,
            title: "解压 ZIP 文件",
            description: "将下载的 ZIP 文件解压到任意目录（如桌面），确保解压后的文件夹包含 manifest.json 文件。",
            icon: "folder_open",
          },
          {
            step: 3,
            title: "打开 Chrome 扩展管理",
            description: "在 Chrome 浏览器地址栏输入 chrome://extensions 并回车，进入扩展管理页面。",
            icon: "browser",
            action: "chrome://extensions",
          },
          {
            step: 4,
            title: "启用开发者模式",
            description: "在扩展管理页面右上角找到「开发者模式」开关，将其启用。",
            icon: "toggle_on",
          },
          {
            step: 5,
            title: "加载已解压的扩展",
            description: "点击页面左上角「加载已解压的扩展」按钮，在文件选择器中选择刚才解压的文件夹。",
            icon: "upload_folder",
          },
          {
            step: 6,
            title: "确认安装成功",
            description: "扩展列表中应显示「内容喵 · 抖音发布助手」，状态为「已启用」。点击扩展图标进行账号绑定。",
            icon: "check_circle",
          },
        ],
        tips: [
          "每次启动 Chrome 可能提示「禁用开发者模式扩展」，选择保留即可",
          "扩展更新后需要重新加载：在 chrome://extensions 点击刷新按钮",
          "建议固定扩展图标到工具栏，方便随时查看发布进度",
        ],
        supportUrl: "/docs/ext-douyin-publisher.md",
      },
    });
  });
}

// 导出别名，兼容 setup-routes.ts 的导入命名
export const registerExtDouyinDownloadRoutes = registerExtensionDownloadRoutes;