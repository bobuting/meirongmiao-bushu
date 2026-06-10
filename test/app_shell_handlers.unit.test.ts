import { describe, expect, it, vi } from "vitest";
import type { AppContext } from "../src/core/app-context.js";

const themeHandler = { listThemes: vi.fn(), getCurrentUserTheme: vi.fn(), setCurrentUserTheme: vi.fn() };
const themeAdminHandler = {
  listThemes: vi.fn(),
  getTheme: vi.fn(),
  createTheme: vi.fn(),
  updateTheme: vi.fn(),
  deleteTheme: vi.fn(),
  duplicateTheme: vi.fn(),
  getThemeStats: vi.fn(),
};
const videoMusicHandler = { __ctx: { store: { config: {} } }, __requireUser: vi.fn() };
const fissionVideoHandler = { listFissionVideos: vi.fn() };

vi.mock("../src/routes/theme-routes.js", () => ({
  createThemeRouteHandlersWithContext: () => themeHandler,
  createThemeAdminRouteHandlersWithContext: () => themeAdminHandler,
}));
vi.mock("../src/routes/video-music-routes.js", () => ({
  createVideoMusicRouteHandlersWithContext: () => videoMusicHandler,
}));
vi.mock("../src/routes/fission-video-routes.js", () => ({
  createFissionVideoRouteHandlersWithContext: () => fissionVideoHandler,
}));

const { createAppShellHandlers } = await import("../src/routes/app-shell-handlers.js");

describe("app shell handlers bundle", () => {
  it("returns default optional handlers and an empty extra registrar bundle", () => {
    const bundle = createAppShellHandlers(
      {} as AppContext,
      () => ({ id: "user-1" }) as never,
      () => ({ id: "admin-1" }) as never,
    );

    expect(bundle.theme).toBe(themeHandler);
    expect(bundle.themeAdmin).toBe(themeAdminHandler);
    expect(bundle.videoMusic).toBe(videoMusicHandler);
    expect(bundle.fissionVideo).toBe(fissionVideoHandler);
    expect(bundle.extraRegistrars).toEqual([]);
  });
});
