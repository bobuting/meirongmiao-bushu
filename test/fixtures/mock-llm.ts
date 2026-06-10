// test/fixtures/mock-llm.ts
/**
 * LLM API Mock 工具
 * 支持三种模式：mock（返回预设响应）、record（录制真实响应）、replay（回放录制）
 */

import { vi } from 'vitest';
import { readFile, writeFile, mkdir, readdir } from 'fs/promises';
import { join } from 'path';

// =====================================================
// 工具函数
// =====================================================

/** 计算字符串的简单 hash（用于精确匹配） */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash.toString(16);
}

// =====================================================
// 类型定义
// =====================================================

/** LLM Mock 配置 */
export interface MockLLMConfig {
  /** 模式：mock（预设响应）、record（录制）、replay（回放） */
  mode: 'mock' | 'record' | 'replay';
  /** 录制文件存储目录（record/replay 模式必需） */
  recordingsDir?: string;
  /** replay 模式下找不到匹配时是否抛错，默认 true */
  strictMode?: boolean;
}

/** LLM 响应结构 */
export interface LLMResponse {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/** 录制记录 */
interface RecordingEntry {
  /** 输入内容的 hash，用于精确匹配 */
  inputHash: string;
  /** 原始输入内容 */
  input: string;
  /** LLM 响应 */
  response: LLMResponse;
  /** 录制时间戳 */
  timestamp: number;
}

// =====================================================
// Mock 模式（预设响应）
// =====================================================

interface MockModeOptions {
  /** 预设响应内容 */
  defaultResponse?: string;
  /** 根据输入匹配响应的映射表 */
  responseMap?: Record<string, string>;
}

/** 创建 Mock 模式的 LLM Adapter */
export function createMockLLMAdapter(options: MockModeOptions = {}): {
  generate: (prompt: string) => Promise<LLMResponse>;
} {
  const defaultResponse = options.defaultResponse ?? '{"result": "mock response"}';

  return {
    generate: vi.fn(async (prompt: string): Promise<LLMResponse> => {
      const matchedResponse = options.responseMap?.[prompt] ?? defaultResponse;

      return {
        content: matchedResponse,
        usage: {
          promptTokens: Math.ceil(prompt.length / 4),
          completionTokens: Math.ceil(matchedResponse.length / 4),
          totalTokens: Math.ceil((prompt.length + matchedResponse.length) / 4),
        },
      };
    }),
  };
}

// =====================================================
// Record 模式（录制真实响应）
// =====================================================

/** 创建 Record 模式的 LLM Adapter */
export function createRecordLLMAdapter(
  realAdapter: { generate: (prompt: string) => Promise<LLMResponse> },
  config: MockLLMConfig,
): {
  generate: (prompt: string) => Promise<LLMResponse>;
} {
  const recordingsDir = config.recordingsDir ?? './test/fixtures/llm-recordings';

  return {
    generate: vi.fn(async (prompt: string): Promise<LLMResponse> => {
      const response = await realAdapter.generate(prompt);

      await mkdir(recordingsDir, { recursive: true });
      const entry: RecordingEntry = {
        inputHash: simpleHash(prompt),
        input: prompt,
        response,
        timestamp: Date.now(),
      };
      const filename = `recording-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`;
      await writeFile(join(recordingsDir, filename), JSON.stringify(entry, null, 2));

      return response;
    }),
  };
}

// =====================================================
// Replay 模式（回放录制）
// =====================================================

/** 创建 Replay 模式的 LLM Adapter */
export function createReplayLLMAdapter(config: MockLLMConfig): {
  generate: (prompt: string) => Promise<LLMResponse>;
  loadRecordings: () => Promise<void>;
} {
  const recordingsDir = config.recordingsDir ?? './test/fixtures/llm-recordings';
  const strictMode = config.strictMode ?? true;
  const recordings: RecordingEntry[] = [];

  async function loadRecordings(): Promise<void> {
    try {
      const files = await readdir(recordingsDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          const content = await readFile(join(recordingsDir, file), 'utf-8');
          recordings.push(JSON.parse(content));
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`[MockLLM] Failed to load recordings from ${recordingsDir}: ${errorMessage}`);
    }
  }

  /** 使用 hash 精确匹配录制记录 */
  function findMatchingRecording(prompt: string): RecordingEntry | undefined {
    const hash = simpleHash(prompt);
    return recordings.find((r) => r.inputHash === hash);
  }

  return {
    loadRecordings,

    generate: vi.fn(async (prompt: string): Promise<LLMResponse> => {
      if (recordings.length === 0) {
        await loadRecordings();
      }

      const matched = findMatchingRecording(prompt);
      if (matched) {
        return matched.response;
      }

      // 严格模式下抛错，非严格模式返回默认响应
      if (strictMode) {
        throw new Error(
          `[MockLLM] No matching recording found for prompt hash: ${simpleHash(prompt)}. ` +
          `Prompt preview: ${prompt.slice(0, 100)}...`,
        );
      }

      // 非严格模式：记录警告并返回默认响应
      console.warn(
        `[MockLLM] Warning: No matching recording found for prompt hash: ${simpleHash(prompt)}. ` +
        `Returning empty response.`,
      );
      return {
        content: '{"result": "no matching recording found"}',
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      };
    }),
  };
}