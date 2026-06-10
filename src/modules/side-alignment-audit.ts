import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

interface CapabilitySpec {
  capability: string;
  sideModule: string;
  mainPatterns: Array<{ label: string; pattern: RegExp }>;
}

export interface SideAlignmentAuditRow {
  capability: string;
  sideModule: string;
  sideFiles: number;
  sideContractFiles: number;
  sideRouteFiles: number;
  mainMatches: number;
  mainEvidence: string[];
  gapLevel: "low" | "medium" | "high";
}

export interface GenerateSideAlignmentAuditInput {
  sideModulesDir: string;
  mainAppPath: string;
  outDir: string;
  nowMs?: number;
}

export interface GenerateSideAlignmentAuditResult {
  outputPath: string;
  rows: number;
  highGaps: number;
}

const CAPABILITY_SPECS: CapabilitySpec[] = [
  {
    capability: "视频能力",
    sideModule: "video-studio",
    mainPatterns: [
      { label: "video-jobs", pattern: /\/projects\/:projectId\/video-jobs/ },
      { label: "export", pattern: /\/projects\/:projectId\/export/ },
      { label: "capability-lab-video", pattern: /\/admin\/capability-lab\/video-generate/ },
    ],
  },
  {
    capability: "URL 反推",
    sideModule: "reverse-copy",
    mainPatterns: [
      { label: "reverse-parse", pattern: /\/reverse\/parse/ },
      { label: "reverse-credentials", pattern: /\/reverse\/credentials/ },
      { label: "capability-lab-reverse", pattern: /\/admin\/capability-lab\/reverse-fetch/ },
    ],
  },
  {
    capability: "视频上传反推",
    sideModule: "video-reverse",
    mainPatterns: [
      { label: "reverse-parse-file", pattern: /fileName:\s*string/ },
      { label: "hot-trend-reverse-to-library", pattern: /reverse-to-library/ },
    ],
  },
  {
    capability: "视频热榜",
    sideModule: "hot-billboard",
    mainPatterns: [
      { label: "admin-hot-trends", pattern: /\/admin\/scripts\/hot-trends/ },
      { label: "square-trends", pattern: /\/square\/trends/ },
      { label: "douhot-health", pattern: /\/admin\/trends\/douhot\/health/ },
    ],
  },
];

function countModuleFiles(dir: string): { files: number; contractFiles: number; routeFiles: number } {
  if (!existsSync(dir)) {
    return { files: 0, contractFiles: 0, routeFiles: 0 };
  }
  const names = readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
    .map((entry) => entry.name);
  return {
    files: names.length,
    contractFiles: names.filter((name) => /contract/i.test(name)).length,
    routeFiles: names.filter((name) => /routes?/i.test(name)).length,
  };
}

function findPatternEvidence(lines: string[], pattern: RegExp, label: string): string[] {
  const evidence: string[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (pattern.test(lines[i])) {
      evidence.push(`${label}@L${i + 1}`);
      if (evidence.length >= 4) {
        break;
      }
    }
  }
  return evidence;
}

export function buildSideAlignmentRows(sideModulesDir: string, mainAppPath: string): SideAlignmentAuditRow[] {
  const appContent = existsSync(mainAppPath) ? readFileSync(mainAppPath, "utf8") : "";
  const appLines = appContent.split(/\r?\n/);
  return CAPABILITY_SPECS.map((spec) => {
    const sideDir = join(sideModulesDir, spec.sideModule);
    const sideStats = countModuleFiles(sideDir);
    const evidence: string[] = [];
    for (const check of spec.mainPatterns) {
      const matches = findPatternEvidence(appLines, check.pattern, check.label);
      evidence.push(...matches);
    }
    const deduped = [...new Set(evidence)];
    const mainMatches = deduped.length;
    let gapLevel: "low" | "medium" | "high" = "low";
    if (sideStats.files > 0 && mainMatches < 1) {
      gapLevel = "high";
    } else if (sideStats.files > 0 && mainMatches < spec.mainPatterns.length) {
      gapLevel = "medium";
    }
    return {
      capability: spec.capability,
      sideModule: spec.sideModule,
      sideFiles: sideStats.files,
      sideContractFiles: sideStats.contractFiles,
      sideRouteFiles: sideStats.routeFiles,
      mainMatches,
      mainEvidence: deduped,
      gapLevel,
    };
  });
}

export function buildSideAlignmentMarkdown(rows: SideAlignmentAuditRow[], generatedAtIso: string): string {
  const highGaps = rows.filter((item) => item.gapLevel === "high").length;
  const mediumGaps = rows.filter((item) => item.gapLevel === "medium").length;

  const lines: string[] = [];
  lines.push("# Side 模块对齐差异审计");
  lines.push("");
  lines.push(`- 生成时间: ${generatedAtIso}`);
  lines.push(`- 审计能力数: ${rows.length}`);
  lines.push(`- 高风险缺口: ${highGaps}`);
  lines.push(`- 中风险缺口: ${mediumGaps}`);
  lines.push("");
  lines.push("## 差异矩阵");
  lines.push("");
  lines.push("| 能力 | Side 模块 | Side 文件数 | Side 合同文件 | Side 路由文件 | 主项目证据数 | 缺口等级 |");
  lines.push("|---|---|---:|---:|---:|---:|---|");
  for (const row of rows) {
    lines.push(
      `| ${row.capability} | ${row.sideModule} | ${row.sideFiles} | ${row.sideContractFiles} | ${row.sideRouteFiles} | ${row.mainMatches} | ${row.gapLevel} |`,
    );
  }

  lines.push("");
  lines.push("## 主项目证据定位");
  lines.push("");
  for (const row of rows) {
    lines.push(`### ${row.capability} / ${row.sideModule}`);
    if (row.mainEvidence.length < 1) {
      lines.push("- evidence: (none)");
    } else {
      lines.push(`- evidence: ${row.mainEvidence.join(", ")}`);
    }
    lines.push("");
  }

  lines.push("## 对齐建议");
  lines.push("");
  lines.push("1. 先补高风险缺口能力的合同与路由映射。");
  lines.push("2. 对中风险能力补 diagnostics.attempts[] 与 fallback 轨迹。");
  lines.push("3. 联调时按四能力分别提供成功/失败样例并固化回归。");
  lines.push("");

  return `${lines.join("\n")}\n`;
}

export function generateSideAlignmentAudit(input: GenerateSideAlignmentAuditInput): GenerateSideAlignmentAuditResult {
  const nowMs = input.nowMs ?? Date.now();
  const generatedAtIso = new Date(nowMs).toISOString();
  const sideModulesDir = resolve(input.sideModulesDir);
  const mainAppPath = resolve(input.mainAppPath);
  const outDir = resolve(input.outDir);

  const rows = buildSideAlignmentRows(sideModulesDir, mainAppPath);
  const markdown = buildSideAlignmentMarkdown(rows, generatedAtIso);
  const stamp = generatedAtIso.replace(/[-:]/g, "").slice(0, 13);
  const outputPath = join(outDir, `side-alignment-audit-${stamp}.md`);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(outputPath, markdown, "utf8");

  return {
    outputPath,
    rows: rows.length,
    highGaps: rows.filter((item) => item.gapLevel === "high").length,
  };
}
