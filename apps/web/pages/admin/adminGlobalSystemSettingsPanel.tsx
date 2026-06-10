import React from "react";

export type AdminSystemSettingsTabKey =
  | "all"
  | "system"
  | "generation";

type AdminGlobalPanelCategory = Exclude<AdminSystemSettingsTabKey, "all">;

export interface AdminGlobalSystemSettingsDraft {
  videoMusicEnabled: boolean;
  videoMusicAllowedAtmospheres: string;
  videoMusicDefaultAtmospheres: string;
  videoMusicPathPrefix: string;
  videoMusicPublicBaseUrl: string;
  videoMusicVisitUrl: string;
  lockoutAttempts: number;
  lockoutMinutes: number;
  sessionTtlHours: number;
  sessionAutoRenewMinutesBeforeExpiry: number;
  scriptMaxDurationSec: number;
  mockCreditDefault: number;
  creditValidityDays: number;
  hotTrendRealtimeTopN: number;
  hotTrendVideoTopN: number;
  hotTrendRealtimeSyncIntervalHours: number;
  hotTrendVideoSyncIntervalHours: number;
  hotTrendVideoDateWindowHours: number;
  // ========== OSS 上传配置 ==========
  ossEndpoint: string;
  ossRegion: string;
  ossAccessKeyId: string;
  ossSecretAccessKey: string;
  ossBucketName: string;
  ossForcePathStyle: boolean;
  ossPublicBaseUrl: string;
  // ========== CharacterWorkflow 字段 ==========
}

export const ADMIN_GLOBAL_SYSTEM_SETTINGS_DEFAULTS: AdminGlobalSystemSettingsDraft = {
  videoMusicEnabled: true,
  videoMusicAllowedAtmospheres: "欢快,喜悦,激烈,阳光,悲伤,活力,极简,自由,公路旅行,轻松,动感,浪漫,慵懒,甜蜜,神秘,空灵,励志",
  videoMusicDefaultAtmospheres: "阳光",
  videoMusicPathPrefix: "/video-music",
  videoMusicPublicBaseUrl: "/video-music",
  videoMusicVisitUrl: "https://api.xcvts.cn/api/hotlist/dy/music",
  lockoutAttempts: 5,
  lockoutMinutes: 15,
  sessionTtlHours: 72,
  sessionAutoRenewMinutesBeforeExpiry: 30,
  scriptMaxDurationSec: 90,
  mockCreditDefault: 100000,
  creditValidityDays: 60,
  hotTrendRealtimeTopN: 20,
  hotTrendVideoTopN: 20,
  hotTrendRealtimeSyncIntervalHours: 2,
  hotTrendVideoSyncIntervalHours: 12,
  hotTrendVideoDateWindowHours: 24,
  // OSS 配置
  ossEndpoint: "",
  ossRegion: "",
  ossAccessKeyId: "",
  ossSecretAccessKey: "",
  ossBucketName: "",
  ossForcePathStyle: true,
  ossPublicBaseUrl: "",
  // CharacterWorkflow 默认值
};

interface GlobalFieldConfig {
  key: keyof AdminGlobalSystemSettingsDraft;
  label: string;
  description?: string;
  inputType?: "number" | "text" | "checkbox" | "textarea";
  rows?: number;
  sensitive?: boolean;
}

interface GlobalCardConfig {
  id: string;
  category: AdminGlobalPanelCategory;
  title: string;
  description?: string;
  columns?: 1 | 2 | 3;
  fields: GlobalFieldConfig[];
}

const settingBubbleClass = "w-full";
const cardShellClass =
  "w-full overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm";

const GLOBAL_CATEGORY_META: Record<
  AdminGlobalPanelCategory,
  { title: string; icon: string; description: string }
> = {
  system: {
    title: "基础系统设置",
    icon: "tune",
    description: "上传限制与登录安全策略",
  },
  generation: {
    title: "生成与积分",
    icon: "auto_awesome",
    description: "生成限制、导出倍率与积分成本",
  },
};

const GLOBAL_CARDS: readonly GlobalCardConfig[] = [
  {
    id: "video-music",
    category: "system",
    title: "音乐能力设置",
    description: "独立音乐入口和 Step5 音乐推荐共用这一组基础参数。",
    columns: 1,
    fields: [
      {
        key: "videoMusicEnabled",
        label: "启用音乐域",
        description: "关闭后，独立音乐入口与 Step5 音乐推荐都不会发起能力调用。",
        inputType: "checkbox",
      },
      {
        key: "videoMusicAllowedAtmospheres",
        label: "允许氛围标签",
        description: "多个标签用逗号分隔，用于脚本和音乐的氛围匹配。",
        inputType: "text",
      },
      {
        key: "videoMusicDefaultAtmospheres",
        label: "默认回退氛围",
        description: "脚本无法识别氛围时按这里的顺序回退。",
        inputType: "text",
      },
      {
        key: "videoMusicPathPrefix",
        label: "本地音乐目录",
        description: "系统默认音乐和后续独立音乐域文件都会写到这里。",
        inputType: "text",
      },
      {
        key: "videoMusicPublicBaseUrl",
        label: "音乐公开访问前缀",
        description: "前端试听和导出混音都通过这个前缀访问音乐文件。",
        inputType: "text",
      },
      {
        key: "videoMusicVisitUrl",
        label: "上游音乐同步地址",
        description: "配置后可从 donor 风格的音乐接口同步远端曲库；留空则只使用本地上传与手工维护。",
        inputType: "text",
      },
    ],
  },
  {
    id: "security-policy",
    category: "system",
    title: "安全策略",
    columns: 2,
    fields: [
      { key: "lockoutAttempts", label: "登录失败锁定阈值（次）" },
      { key: "lockoutMinutes", label: "锁定时长（分钟）" },
      { key: "sessionTtlHours", label: "会话有效期（小时）", description: "用户登录会话的有效时长，超时后需重新登录。" },
      { key: "sessionAutoRenewMinutesBeforeExpiry", label: "自动续期阈值（分钟）", description: "距会话过期不足此时间时自动续期。" },
    ],
  },
  {
    id: "generation",
    category: "generation",
    title: "生成参数",
    columns: 2,
    fields: [
      { key: "scriptMaxDurationSec", label: "脚本最大时长（秒）" },
    ],
  },
  {
    id: "credits",
    category: "generation",
    title: "积分策略",
    columns: 2,
    fields: [
      { key: "mockCreditDefault", label: "Mock 初始积分" },
      { key: "creditValidityDays", label: "积分有效期（天）" },
    ],
  },
  // ========== OSS 上传配置 ==========
  {
    id: "oss-config",
    category: "system",
    title: "OSS 上传配置",
    columns: 2,
    fields: [
      { key: "ossEndpoint", label: "OSS 端点地址", inputType: "text" },
      { key: "ossRegion", label: "OSS 区域", inputType: "text" },
      { key: "ossAccessKeyId", label: "Access Key ID", inputType: "text", sensitive: true },
      { key: "ossSecretAccessKey", label: "Secret Access Key", inputType: "text", sensitive: true },
      { key: "ossBucketName", label: "Bucket名称", inputType: "text" },
      { key: "ossForcePathStyle", label: "强制路径样式", inputType: "checkbox" },
      { key: "ossPublicBaseUrl", label: "公开访问基础 URL", inputType: "text" },
    ],
  },


] as const;

export function buildAdminGlobalSystemSettingsDraft(
  source?: Partial<AdminGlobalSystemSettingsDraft> | null,
): AdminGlobalSystemSettingsDraft {
  return {
    videoMusicEnabled:
      typeof source?.videoMusicEnabled === "boolean"
        ? source.videoMusicEnabled
        : ADMIN_GLOBAL_SYSTEM_SETTINGS_DEFAULTS.videoMusicEnabled,
    videoMusicAllowedAtmospheres:
      typeof source?.videoMusicAllowedAtmospheres === "string" && source.videoMusicAllowedAtmospheres.trim().length > 0
        ? source.videoMusicAllowedAtmospheres
        : ADMIN_GLOBAL_SYSTEM_SETTINGS_DEFAULTS.videoMusicAllowedAtmospheres,
    videoMusicDefaultAtmospheres:
      typeof source?.videoMusicDefaultAtmospheres === "string" && source.videoMusicDefaultAtmospheres.trim().length > 0
        ? source.videoMusicDefaultAtmospheres
        : ADMIN_GLOBAL_SYSTEM_SETTINGS_DEFAULTS.videoMusicDefaultAtmospheres,
    videoMusicPathPrefix:
      typeof source?.videoMusicPathPrefix === "string" && source.videoMusicPathPrefix.trim().length > 0
        ? source.videoMusicPathPrefix
        : ADMIN_GLOBAL_SYSTEM_SETTINGS_DEFAULTS.videoMusicPathPrefix,
    videoMusicPublicBaseUrl:
      typeof source?.videoMusicPublicBaseUrl === "string" && source.videoMusicPublicBaseUrl.trim().length > 0
        ? source.videoMusicPublicBaseUrl
        : ADMIN_GLOBAL_SYSTEM_SETTINGS_DEFAULTS.videoMusicPublicBaseUrl,
    videoMusicVisitUrl:
      typeof source?.videoMusicVisitUrl === "string"
        ? source.videoMusicVisitUrl
        : ADMIN_GLOBAL_SYSTEM_SETTINGS_DEFAULTS.videoMusicVisitUrl,
    lockoutAttempts:
      typeof source?.lockoutAttempts === "number" ? source.lockoutAttempts : ADMIN_GLOBAL_SYSTEM_SETTINGS_DEFAULTS.lockoutAttempts,
    lockoutMinutes:
      typeof source?.lockoutMinutes === "number" ? source.lockoutMinutes : ADMIN_GLOBAL_SYSTEM_SETTINGS_DEFAULTS.lockoutMinutes,
    sessionTtlHours:
      typeof source?.sessionTtlHours === "number" ? source.sessionTtlHours : ADMIN_GLOBAL_SYSTEM_SETTINGS_DEFAULTS.sessionTtlHours,
    sessionAutoRenewMinutesBeforeExpiry:
      typeof source?.sessionAutoRenewMinutesBeforeExpiry === "number"
        ? source.sessionAutoRenewMinutesBeforeExpiry
        : ADMIN_GLOBAL_SYSTEM_SETTINGS_DEFAULTS.sessionAutoRenewMinutesBeforeExpiry,
    scriptMaxDurationSec:
      typeof source?.scriptMaxDurationSec === "number"
        ? source.scriptMaxDurationSec
        : ADMIN_GLOBAL_SYSTEM_SETTINGS_DEFAULTS.scriptMaxDurationSec,
    mockCreditDefault:
      typeof source?.mockCreditDefault === "number"
        ? source.mockCreditDefault
        : ADMIN_GLOBAL_SYSTEM_SETTINGS_DEFAULTS.mockCreditDefault,
    creditValidityDays:
      typeof source?.creditValidityDays === "number"
        ? source.creditValidityDays
        : ADMIN_GLOBAL_SYSTEM_SETTINGS_DEFAULTS.creditValidityDays,
    hotTrendRealtimeTopN:
      typeof source?.hotTrendRealtimeTopN === "number"
        ? source.hotTrendRealtimeTopN
        : ADMIN_GLOBAL_SYSTEM_SETTINGS_DEFAULTS.hotTrendRealtimeTopN,
    hotTrendVideoTopN:
      typeof source?.hotTrendVideoTopN === "number"
        ? source.hotTrendVideoTopN
        : ADMIN_GLOBAL_SYSTEM_SETTINGS_DEFAULTS.hotTrendVideoTopN,
    hotTrendRealtimeSyncIntervalHours:
      typeof source?.hotTrendRealtimeSyncIntervalHours === "number"
        ? source.hotTrendRealtimeSyncIntervalHours
        : ADMIN_GLOBAL_SYSTEM_SETTINGS_DEFAULTS.hotTrendRealtimeSyncIntervalHours,
    hotTrendVideoSyncIntervalHours:
      typeof source?.hotTrendVideoSyncIntervalHours === "number"
        ? source.hotTrendVideoSyncIntervalHours
        : ADMIN_GLOBAL_SYSTEM_SETTINGS_DEFAULTS.hotTrendVideoSyncIntervalHours,
    hotTrendVideoDateWindowHours:
      typeof source?.hotTrendVideoDateWindowHours === "number"
        ? source.hotTrendVideoDateWindowHours
        : ADMIN_GLOBAL_SYSTEM_SETTINGS_DEFAULTS.hotTrendVideoDateWindowHours,
    // OSS 配置
    ossEndpoint:
      typeof source?.ossEndpoint === "string" ? source.ossEndpoint : ADMIN_GLOBAL_SYSTEM_SETTINGS_DEFAULTS.ossEndpoint,
    ossRegion:
      typeof source?.ossRegion === "string" ? source.ossRegion : ADMIN_GLOBAL_SYSTEM_SETTINGS_DEFAULTS.ossRegion,
    ossAccessKeyId:
      typeof source?.ossAccessKeyId === "string"
        ? source.ossAccessKeyId
        : ADMIN_GLOBAL_SYSTEM_SETTINGS_DEFAULTS.ossAccessKeyId,
    ossSecretAccessKey:
      typeof source?.ossSecretAccessKey === "string"
        ? source.ossSecretAccessKey
        : ADMIN_GLOBAL_SYSTEM_SETTINGS_DEFAULTS.ossSecretAccessKey,
    ossBucketName:
      typeof source?.ossBucketName === "string"
        ? source.ossBucketName
        : ADMIN_GLOBAL_SYSTEM_SETTINGS_DEFAULTS.ossBucketName,
    ossForcePathStyle:
      typeof source?.ossForcePathStyle === "boolean"
        ? source.ossForcePathStyle
        : ADMIN_GLOBAL_SYSTEM_SETTINGS_DEFAULTS.ossForcePathStyle,
    ossPublicBaseUrl:
      typeof source?.ossPublicBaseUrl === "string"
        ? source.ossPublicBaseUrl
        : ADMIN_GLOBAL_SYSTEM_SETTINGS_DEFAULTS.ossPublicBaseUrl,
    // CharacterWorkflow 字段
  };
}

function renderFieldValue(
  draft: AdminGlobalSystemSettingsDraft,
  field: GlobalFieldConfig,
  onChange: (patch: Partial<AdminGlobalSystemSettingsDraft>) => void,
): React.ReactNode {
  if (field.inputType === "checkbox") {
    return (
      <label className={`${settingBubbleClass} flex items-center justify-between gap-4 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3`}>
        <div className="pr-2">
          <div className="text-sm font-semibold text-gray-900">{field.label}</div>
          {field.description ? <p className="mt-1 text-xs leading-5 text-gray-500">{field.description}</p> : null}
        </div>
        <input
          data-testid={`admin-global-system-setting-${field.key}`}
           type={
                field.inputType === "checkbox"
                  ? "checkbox"
                  : field.sensitive
                    ? "password"
                    : field.inputType ?? "number"
              }
          checked={Boolean(draft[field.key])}
          onChange={(event) => onChange({ [field.key]: event.target.checked })}
          className="shrink-0"
        />
      </label>
    );
  }

  if (field.inputType === "textarea") {
    return (
      <label className="block w-full rounded-lg border border-gray-200 bg-gray-50 p-4">
        <div className="text-sm font-semibold text-gray-900">{field.label}</div>
        {field.description ? <p className="mt-1 text-xs leading-5 text-gray-500">{field.description}</p> : null}
        <textarea
          data-testid={`admin-global-system-setting-${field.key}`}
          rows={field.rows ?? 10}
          value={String(draft[field.key] ?? "")}
          onChange={(event) => onChange({ [field.key]: event.target.value })}
          className="mt-3 w-full rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm leading-6 text-gray-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
      </label>
    );
  }

  return (
    <label className={`${settingBubbleClass} block rounded-lg border border-gray-200 bg-gray-50 p-4`}>
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">{field.label}</div>
      {field.description ? <p className="mt-1 text-xs leading-5 text-gray-500">{field.description}</p> : null}
      <input
        data-testid={`admin-global-system-setting-${field.key}`}
        type={field.inputType ?? "number"}
        value={String(draft[field.key] ?? "")}
        onChange={(event) =>
          onChange(
            field.inputType === "text"
              ? { [field.key]: event.target.value }
              : { [field.key]: Number(event.target.value) },
          )
        }
        placeholder={field.sensitive ? "已保存（点击修改）" : undefined}
        className="mt-3 w-full rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
      />
    </label>
  );
}

interface AdminGlobalSystemSettingsPanelProps {
  draft: AdminGlobalSystemSettingsDraft;
  activeTab: AdminSystemSettingsTabKey;
  feedback?: string;
  savingSectionId?: string | null;
  onChange: (patch: Partial<AdminGlobalSystemSettingsDraft>) => void;
  onSaveSection: (sectionId: string) => void;
  onResetSection: (sectionId: string) => void;
}

export const AdminGlobalSystemSettingsPanel: React.FC<AdminGlobalSystemSettingsPanelProps> = ({
  draft,
  activeTab,
  feedback,
  savingSectionId,
  onChange,
  onSaveSection,
  onResetSection,
}) => {
  const visibleCategories = (Object.keys(GLOBAL_CATEGORY_META) as AdminGlobalPanelCategory[]).filter((category) =>
    activeTab === "all" ? true : activeTab === category,
  );

  if (visibleCategories.length < 1) {
    return null;
  }

  return (
    <section data-testid="admin-global-system-settings-panel" className="space-y-8">
      <div className="sr-only">系统参数设置 保存系统参数</div>
      {feedback ? (
        <div className="border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">{feedback}</div>
      ) : null}
      {visibleCategories.map((category) => {
        const categoryMeta = GLOBAL_CATEGORY_META[category];
        const cards = GLOBAL_CARDS.filter((card) => card.category === category);
        return (
          <section key={category} className="space-y-4">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-9 w-9 items-center justify-center bg-gray-100 text-gray-600">
                <span className="material-icons-round text-[18px]">{categoryMeta.icon}</span>
              </span>
              <div>
                <h2 className="text-xl font-bold text-[#0f172a]">{categoryMeta.title}</h2>
                <p className="text-sm text-[#64748b]">{categoryMeta.description}</p>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {cards.map((card) => (
                <section key={card.id} className={`${cardShellClass} ${card.columns === 1 ? "lg:col-span-1" : ""}`}>
                  <div className="flex items-center justify-between border-l-4 border-gray-400 bg-gray-50 px-5 py-4">
                    <div>
                      <h3 className="text-base font-bold text-gray-900">{card.title}</h3>
                      {card.description ? <p className="mt-1 text-xs text-gray-500">{card.description}</p> : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onResetSection(card.id)}
                        className="border border-gray-200 bg-white px-3 py-1 text-xs font-semibold text-gray-600 transition hover:bg-gray-100"
                      >
                        回到默认
                      </button>
                      <button
                        type="button"
                        onClick={() => onSaveSection(card.id)}
                        className="bg-primary px-3 py-1 text-xs font-semibold text-white transition hover:bg-primary/90"
                      >
                        {savingSectionId === card.id ? "保存中..." : "保存"}
                      </button>
                    </div>
                  </div>
                  <div className={`grid gap-4 p-5 ${card.columns === 1 ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2"}`}>
                    {card.fields.map((field) => (
                      <div key={field.key} className={settingBubbleClass}>
                        {renderFieldValue(draft, field, onChange)}
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </section>
        );
      })}
    </section>
  );
};
