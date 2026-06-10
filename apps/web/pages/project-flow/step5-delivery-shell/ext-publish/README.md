# 扩展发布组件

独立于服务端自动化的发布面板，用于 Chrome 扩展发布。

## 使用方式

```tsx
import { ExtDouyinPublishPanel } from "./step5-delivery-shell/ext-publish";

// 在页面中使用
<ExtDouyinPublishPanel
  videoUrl="https://..."
  title="视频标题"
  tags={["标签1", "标签2"]}
  coverImageUrl="https://..."
  onPublishSuccess={() => console.log("发布成功")}
  onPublishError={(error) => console.error(error)}
/>
```

## Props

| 属性 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `videoUrl` | `string` | 是 | 视频 URL（签名 URL 或代理 URL） |
| `title` | `string` | 是 | 视频标题（最多 30 字） |
| `tags` | `string[]` | 否 | 话题标签数组 |
| `coverImageUrl` | `string \| null` | 否 | 封面图片 URL |
| `onPublishSuccess` | `() => void` | 否 | 发布成功回调 |
| `onPublishError` | `(error: string) => void` | 否 | 发布失败回调 |

## 依赖

- `useDouyinExtension` Hook：检测扩展状态、发送发布请求
- Chrome 扩展：必须安装并启用
