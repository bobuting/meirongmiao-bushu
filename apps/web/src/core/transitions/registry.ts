/**
 * Canvas 2D Transition Registry
 *
 * Map-based registry for transition definitions and renderers.
 * 复刻 FreeCut 的 TransitionRegistry 模式。
 */

import type {
  CanvasTransitionDefinition,
  TransitionRenderer,
  TransitionRegistryEntry,
} from './types'
import type { TransitionCategory } from '../types/transition'

// 导出类型供渲染器使用
export type { TransitionRenderer, TransitionStyleCalculation, CanvasTransitionDefinition } from './types'

/**
 * Transition Registry class.
 * 存储转场定义和渲染器。
 */
export class TransitionRegistry {
  private entries: Map<string, TransitionRegistryEntry> = new Map()

  /**
   * 注册转场
   */
  register(
    id: string,
    definition: CanvasTransitionDefinition,
    renderer: TransitionRenderer,
  ): void {
    if (this.entries.has(id)) {
      console.warn(`[TransitionRegistry] Transition "${id}" is being overwritten`)
    }
    this.entries.set(id, { definition, renderer })
  }

  /**
   * 取消注册
   */
  unregister(id: string): boolean {
    return this.entries.delete(id)
  }

  /**
   * 获取注册条目
   */
  get(id: string): TransitionRegistryEntry | undefined {
    return this.entries.get(id)
  }

  /**
   * 获取渲染器
   */
  getRenderer(id: string): TransitionRenderer | undefined {
    return this.entries.get(id)?.renderer
  }

  /**
   * 获取定义
   */
  getDefinition(id: string): CanvasTransitionDefinition | undefined {
    return this.entries.get(id)?.definition
  }

  /**
   * 检查是否已注册
   */
  has(id: string): boolean {
    return this.entries.has(id)
  }

  /**
   * 获取所有条目
   */
  getAll(): Map<string, TransitionRegistryEntry> {
    return new Map(this.entries)
  }

  /**
   * 按分类获取
   */
  getByCategory(category: TransitionCategory): TransitionRegistryEntry[] {
    const result: TransitionRegistryEntry[] = []
    for (const entry of this.entries.values()) {
      if (entry.definition.category === category) {
        result.push(entry)
      }
    }
    return result
  }

  /**
   * 获取所有定义（用于 UI）
   */
  getDefinitions(): CanvasTransitionDefinition[] {
    return Array.from(this.entries.values()).map((e) => e.definition)
  }

  /**
   * 获取所有 ID
   */
  getIds(): string[] {
    return Array.from(this.entries.keys())
  }

  /**
   * 清空所有
   */
  clear(): void {
    this.entries.clear()
  }

  /**
   * 获取数量
   */
  get size(): number {
    return this.entries.size
  }
}

/**
 * 全局单例注册表
 */
export const canvasTransitionRegistry = new TransitionRegistry()