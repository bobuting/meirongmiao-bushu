import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";

async function login(app: FastifyInstance, email: string, password: string): Promise<string> {
  const response = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email, password },
  });
  expect(response.statusCode).toBe(200);
  return response.json().token as string;
}

describe("video music routes", () => {
  const apps: FastifyInstance[] = [];

  afterEach(async () => {
    while (apps.length > 0) {
      const app = apps.pop();
      if (app) {
        await app.close();
      }
    }
  });

  it("lists seeded music entries, serves static audio, and matches by script", async () => {
    const app = await buildApp();
    apps.push(app);
    const token = await login(app, "admin@example.com", "admin123");

    const listResponse = await app.inject({
      method: "GET",
      url: "/api/video-music",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(listResponse.statusCode).toBe(200);
    const listPayload = listResponse.json() as {
      enabled: boolean;
      items: Array<{ id: string; musicUrl: string }>;
    };
    expect(listPayload.enabled).toBe(true);
    expect(listPayload.items.length).toBeGreaterThan(0);

    const firstMusicUrl = listPayload.items[0]?.musicUrl ?? "";
    const staticResponse = await app.inject({
      method: "GET",
      url: firstMusicUrl,
    });
    expect(staticResponse.statusCode).toBe(200);
    expect(String(staticResponse.headers["content-type"])).toContain("audio/wav");

    const matchResponse = await app.inject({
      method: "POST",
      url: "/api/video-music/match-by-script",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        scriptText: "一条轻松阳光的城市日常通勤穿搭视频，节奏明快。",
      },
    });
    expect(matchResponse.statusCode).toBe(200);
    const matchPayload = matchResponse.json() as {
      success: boolean;
      music: { id: string; musicUrl: string } | null;
      candidateAtmospheres: string[];
    };
    expect(matchPayload.success).toBe(true);
    expect(matchPayload.music?.id).toBeTruthy();
    expect(matchPayload.candidateAtmospheres.length).toBeGreaterThan(0);
  });
});
