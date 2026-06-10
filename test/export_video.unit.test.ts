import { describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";

async function registerAndLogin(app: FastifyInstance) {
  await app.inject({ method: "POST", url: "/auth/register", payload: { email: "fe@demo.com", password: "abcdef" } });
  const login = await app.inject({ method: "POST", url: "/auth/login", payload: { email: "fe@demo.com", password: "abcdef" } });
  expect(login.statusCode).toBe(200);
  return login.json().token as string;
}

describe("F-010 export video", () => {
  it("defaults to 720p export when not specified", async () => {
    const app = await buildApp();
    try {
      const token = await registerAndLogin(app);
      const project = await app.inject({ method: "POST", url: "/projects", headers: { authorization: `Bearer ${token}` }, payload: { name: "p-f010" } });
      expect(project.statusCode).toBe(200);
      const projectId = project.json().id as string;

      const exp = await app.inject({ method: "POST", url: `/projects/${projectId}/export`, headers: { authorization: `Bearer ${token}` }, payload: {} });
      expect(exp.statusCode).toBe(200);
      const url: string = exp.json().url;
      expect(url.endsWith("/720p.mp4")).toBe(true);
      expect(exp.json().cost).toBe(10); // base cost at 720p
    } finally {
      await app.close();
    }
  });

  it("supports optional 1080p export with multiplier", async () => {
    const app = await buildApp();
    try {
      const token = await registerAndLogin(app);
      const project = await app.inject({ method: "POST", url: "/projects", headers: { authorization: `Bearer ${token}` }, payload: { name: "p-f010b" } });
      const projectId = project.json().id as string;
      const exp = await app.inject({ method: "POST", url: `/projects/${projectId}/export`, headers: { authorization: `Bearer ${token}` }, payload: { resolution: "1080p" } });
      expect(exp.statusCode).toBe(200);
      const url: string = exp.json().url;
      expect(url.endsWith("/1080p.mp4")).toBe(true);
      expect(exp.json().cost).toBe(20); // default multiplier=2
    } finally {
      await app.close();
    }
  });

  it("accepts optional music payload without breaking the export route", async () => {
    const app = await buildApp();
    try {
      const token = await registerAndLogin(app);
      const project = await app.inject({
        method: "POST",
        url: "/projects",
        headers: { authorization: `Bearer ${token}` },
        payload: { name: "p-f010c" },
      });
      const projectId = project.json().id as string;
      const exp = await app.inject({
        method: "POST",
        url: `/projects/${projectId}/export`,
        headers: { authorization: `Bearer ${token}` },
        payload: {
          resolution: "720p",
          music: {
            musicUrl: "/video-music/music-sunrise.wav",
            musicVolume: 0.22,
            musicFadeInSec: 0.6,
            musicFadeOutSec: 1.4,
          },
        },
      });
      expect(exp.statusCode).toBe(200);
      expect(exp.json().cost).toBe(10);
    } finally {
      await app.close();
    }
  });
});
