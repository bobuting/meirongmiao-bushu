/**
 * Credit Badge Preview - 积分徽章组件预览页
 * 访问 /credit-badge-preview 查看效果
 */
import { CreditBadge } from "../components/ui/CreditBadge";

export function CreditBadgePreview() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">积分标识系统</h1>
        <p className="text-gray-500 mb-12">Credit Badge System — 4 种变体，优雅统一</p>

        {/* Pill Variant */}
        <section className="mb-12">
          <h2 className="text-sm font-semibold text-gray-600 mb-4 uppercase tracking-wide">V1 — Pill 胶囊（按钮内联）</h2>
          <div className="flex flex-wrap items-center gap-6 bg-white rounded-2xl border border-gray-100 p-8 shadow-sm">
            <div className="flex items-center gap-3 h-12 rounded-full px-6 bg-gradient-to-r from-orange-500 to-orange-600 text-white shadow-lg shadow-orange-500/20">
              <span className="material-icons-round text-lg">auto_fix_high</span>
              <span className="font-semibold">进入定妆</span>
              <span className="w-px h-4 bg-white/20" />
              <CreditBadge amount={45} variant="pill" />
            </div>
            <div className="flex items-center gap-3 h-12 rounded-full px-6 bg-gradient-to-r from-orange-500 to-orange-600 text-white shadow-lg shadow-orange-500/20">
              <span className="material-icons-round text-lg">download</span>
              <span className="font-semibold">裂变导出</span>
              <span className="w-px h-4 bg-white/20" />
              <CreditBadge amount={10} variant="pill" />
            </div>
            <div className="flex items-center gap-3 h-12 rounded-full px-6 bg-gradient-to-r from-orange-500 to-orange-600 text-white shadow-lg shadow-orange-500/20">
              <span className="material-icons-round text-lg">bolt</span>
              <span className="font-semibold">批量生成</span>
              <span className="w-px h-4 bg-white/20" />
              <CreditBadge amount={120} variant="pill" />
            </div>
          </div>
        </section>

        {/* Badge Variant */}
        <section className="mb-12">
          <h2 className="text-sm font-semibold text-gray-600 mb-4 uppercase tracking-wide">V2 — Badge 角标（图标按钮）</h2>
          <div className="flex flex-wrap items-center gap-8 bg-white rounded-2xl border border-gray-100 p-8 shadow-sm">
            <div className="relative">
              <button className="h-12 w-12 rounded-xl bg-white border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors shadow-sm">
                <span className="material-icons-round text-xl">refresh</span>
              </button>
              <CreditBadge amount={45} variant="badge" />
            </div>
            <div className="relative">
              <button className="h-12 w-12 rounded-xl bg-white border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors shadow-sm">
                <span className="material-icons-round text-xl">refresh</span>
              </button>
              <CreditBadge amount={10} variant="badge" />
            </div>
            <div className="relative">
              <button className="h-12 w-12 rounded-xl bg-white border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors shadow-sm">
                <span className="material-icons-round text-xl">refresh</span>
              </button>
              <CreditBadge amount={120} variant="badge" />
            </div>
          </div>
        </section>

        {/* Inline Variant */}
        <section className="mb-12">
          <h2 className="text-sm font-semibold text-gray-600 mb-4 uppercase tracking-wide">V3 — Inline 行内（提示文本）</h2>
          <div className="bg-white rounded-2xl border border-gray-100 p-8 shadow-sm space-y-3">
            <p className="text-sm text-gray-600">
              重试生成（<CreditBadge amount={45} variant="inline" />，约 28 秒）
            </p>
            <p className="text-sm text-gray-600">
              批量生成预计消耗 <CreditBadge amount={120} variant="inline" />
            </p>
            <p className="text-sm text-gray-600">
              本次操作消耗 <CreditBadge amount={15} variant="inline" />
            </p>
          </div>
        </section>

        {/* Display Variant */}
        <section className="mb-12">
          <h2 className="text-sm font-semibold text-gray-600 mb-4 uppercase tracking-wide">V4 — Display 展示（大数字）</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm flex items-center gap-4">
              <CreditBadge amount={520} variant="display" />
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm flex items-center gap-4">
              <CreditBadge amount={1280} variant="display" />
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm flex items-center gap-4">
              <CreditBadge amount={36} variant="display" />
            </div>
          </div>
        </section>

        {/* Shimmer Animation */}
        <section className="mb-12">
          <h2 className="text-sm font-semibold text-gray-600 mb-4 uppercase tracking-wide">微光动画（吸引注意）</h2>
          <div className="flex flex-wrap items-center gap-8 bg-gray-900 rounded-2xl p-8">
            <CreditBadge amount={45} variant="pill" shimmer />
            <div className="relative">
              <button className="h-12 w-12 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center text-white/70">
                <span className="material-icons-round text-xl">refresh</span>
              </button>
              <CreditBadge amount={45} variant="badge" shimmer />
            </div>
            <CreditBadge amount={520} variant="display" shimmer />
          </div>
        </section>

        {/* Color Reference */}
        <section className="border-t border-gray-200 pt-8">
          <h2 className="text-sm font-semibold text-gray-600 mb-4 uppercase tracking-wide">配色方案</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 mb-2" />
              <div className="text-xs font-semibold text-gray-700">渐变主色</div>
              <div className="text-[10px] text-gray-400">#fbbf24 → #f59e0b</div>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-r from-amber-400/20 to-orange-400/20 border border-amber-200/50 mb-2" />
              <div className="text-xs font-semibold text-gray-700">Pill 背景</div>
              <div className="text-[10px] text-gray-400">amber-400/20 → orange-400/20</div>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-r from-orange-500 to-orange-600 mb-2" />
              <div className="text-xs font-semibold text-gray-700">按钮渐变</div>
              <div className="text-[10px] text-gray-400">#f97316 → #ea580c</div>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-r from-amber-500 via-orange-500 to-orange-600 mb-2" />
              <div className="text-xs font-semibold text-gray-700">Display 文字渐变</div>
              <div className="text-[10px] text-gray-400">amber-500 → orange-600</div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
