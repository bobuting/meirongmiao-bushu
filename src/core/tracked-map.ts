/**
 * TrackedMap — 带脏追踪的 Map
 *
 * 继承标准 Map，所有 set/delete/clear 操作自动记录变更。
 * flush 时通过 consumeDirty() 取出增量变更，避免全量序列化。
 */
export class TrackedMap<K, V> extends Map<K, V> {
  private dirtyKeys = new Set<K>();
  private deletedKeys = new Set<K>();

  override set(key: K, value: V): this {
    this.dirtyKeys.add(key);
    this.deletedKeys.delete(key);
    return super.set(key, value);
  }

  override delete(key: K): boolean {
    if (super.has(key)) {
      this.dirtyKeys.delete(key);
      this.deletedKeys.add(key);
    }
    return super.delete(key);
  }

  override clear(): void {
    for (const key of this.keys()) {
      this.deletedKeys.add(key);
    }
    this.dirtyKeys.clear();
    super.clear();
  }

  /** 消费脏数据，返回增量变更，消费后清空标记 */
  consumeDirty(): { upserts: Array<[K, V]>; deletions: K[] } {
    const upserts: Array<[K, V]> = [];
    for (const key of this.dirtyKeys) {
      const val = super.get(key);
      if (val !== undefined) upserts.push([key, val]);
    }
    const deletions = [...this.deletedKeys];
    this.dirtyKeys.clear();
    this.deletedKeys.clear();
    return { upserts, deletions };
  }

  /** 是否有任何脏数据 */
  hasDirty(): boolean {
    return this.dirtyKeys.size > 0 || this.deletedKeys.size > 0;
  }

  /** 清除所有脏标记（不改变数据）— 用于 hydrate 或全量 flush 后 */
  clearDirty(): void {
    this.dirtyKeys.clear();
    this.deletedKeys.clear();
  }
}
