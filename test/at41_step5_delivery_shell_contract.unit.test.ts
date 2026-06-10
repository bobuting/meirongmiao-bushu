import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertStep5DeliveryShellContract,
  normalizeStep5DeliveryPayload,
  normalizeStep5DeliveryShellPlan,
  STEP5_DELIVERY_SHELL_INVARIANTS,
  STEP5_DELIVERY_SHELL_PAGE_REMAINING_RESPONSIBILITIES,
  STEP5_DELIVERY_SHELL_PLAN,
  STEP5_DELIVERY_SHELL_RUNTIME_CONTRACT,
} from "../src/contracts/step5-delivery-shell-contract";

describe("AT41-07 step5 delivery shell contract", () => {
  it("freezes the route target, thin-shell runtime, and remaining page responsibilities", () => {
    expect(assertStep5DeliveryShellContract()).toEqual({
      version: "AT41-07.v1",
      shellCount: 4,
      routeTarget: "/create/step5",
      heavyWorkspace: false,
      donorPageCount: 0,
    });
    expect(STEP5_DELIVERY_SHELL_PAGE_REMAINING_RESPONSIBILITIES).toEqual([
      "route assembly",
      "error boundary wiring",
      "module injection",
      "final action navigation",
    ]);
    expect(STEP5_DELIVERY_SHELL_RUNTIME_CONTRACT).toEqual({
      routeTarget: "/create/step5",
      heavyWorkspace: false,
      sourceOfTruth: "step4-delivery-payload",
      legacyStateAsSourceOfTruth: false,
    });
    expect(STEP5_DELIVERY_SHELL_INVARIANTS).toContain(
      "Legacy donor pages for the old delivery experience have been removed; Step5 work lands only in the dedicated step5-delivery-shell subtree.",
    );
  });

  it("normalizes the four shell boundaries and rejects duplicate ids", () => {
    const normalized = normalizeStep5DeliveryShellPlan(STEP5_DELIVERY_SHELL_PLAN);
    expect(normalized.map((entry) => entry.shellId)).toEqual([
      "route-shell",
      "result-consumption",
      "delivery-actions",
      "legacy-isolation",
    ]);
    expect(() =>
      normalizeStep5DeliveryShellPlan([
        STEP5_DELIVERY_SHELL_PLAN[0],
        STEP5_DELIVERY_SHELL_PLAN[0],
        STEP5_DELIVERY_SHELL_PLAN[2],
        STEP5_DELIVERY_SHELL_PLAN[3],
      ]),
    ).toThrow("duplicate shellId: route-shell");
  });

  it("normalizes the step4 delivery payload and rejects non-step4 sources", () => {
    expect(
      normalizeStep5DeliveryPayload({
        projectId: "project-41",
        scriptId: "script-7",
        finalVideoUrl: "https://video.example.com/final.mp4",
        clipVideoUrls: ["https://video.example.com/scene-1.mp4"],
        coverImageUrl: null,
        titleCandidates: ["标题 A", "标题 B"],
        squarePublishCategory: null,
        sourceStep: "step4",
      }),
    ).toEqual({
      projectId: "project-41",
      scriptId: "script-7",
      finalVideoUrl: "https://video.example.com/final.mp4",
      clipVideoUrls: ["https://video.example.com/scene-1.mp4"],
      coverImageUrl: null,
      titleCandidates: ["标题 A", "标题 B"],
      squarePublishCategory: null,
      sourceStep: "step4",
    });
    expect(() => normalizeStep5DeliveryPayload({ projectId: "p1", titleCandidates: [], sourceStep: "step3" })).toThrow(
      "sourceStep must be step4",
    );
  });

  it("anchors current owners and dependencies to real repo files", () => {
    for (const entry of STEP5_DELIVERY_SHELL_PLAN) {
      const sources = entry.currentOwnerFiles.map((file) => readFileSync(resolve(process.cwd(), file), "utf8"));
      for (const symbol of entry.ownedSymbols) {
        expect(
          sources.some((source) => source.includes(symbol)),
          `${entry.shellId} should keep ${symbol} in one of ${entry.currentOwnerFiles.join(", ")}`,
        ).toBe(true);
      }
      for (const dependency of entry.contractDependencies) {
        expect(() => readFileSync(resolve(process.cwd(), dependency), "utf8")).not.toThrow();
      }
      expect(entry.targetFile.startsWith("apps/web/pages/project-flow/step5-delivery-shell/")).toBe(true);
    }
  });
});
