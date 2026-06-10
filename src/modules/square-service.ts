import type { User } from "../contracts/types.js";
import type { PublicResource } from "../contracts/types.js";
import type { IPublicResourceRepository } from "../contracts/repository-ports/review-repository.js";
import type { IScriptVersionRepository } from "../contracts/repository-ports/script-repository.js";
import type { ISquareService } from "../contracts/services.js";

export class SquareService implements ISquareService {
  constructor(
    private readonly repos: {
      publicResources: IPublicResourceRepository;
      scripts: IScriptVersionRepository;
    },
  ) {}

  async listPublic(): Promise<PublicResource[]> {
    const latestByResourceId = new Map<string, PublicResource>();
    const allResources = await this.repos.publicResources.list();
    for (const resource of allResources) {
      const script = await this.repos.scripts.findById(resource.resourceId);
      if (!script) {
        continue;
      }
      if ((script as { userId: string }).userId !== resource.ownerUserId) {
        continue;
      }
      const existing = latestByResourceId.get(resource.resourceId);
      if (!existing || existing.publishedAt < resource.publishedAt) {
        latestByResourceId.set(resource.resourceId, resource);
      }
    }
    return [...latestByResourceId.values()].sort((a, b) => b.publishedAt - a.publishedAt);
  }

  async listMyPrivate(user: User): Promise<string[]> {
    const publicList = await this.listPublic();
    const publicIds = new Set(
      publicList
        .filter((x) => x.ownerUserId === user.id)
        .map((x) => x.resourceId),
    );
    // 通过 Repository 查询用户脚本 ID（替代 pool.query）
    return this.repos.scripts.findIdsByUserId(user.id);
  }
}
