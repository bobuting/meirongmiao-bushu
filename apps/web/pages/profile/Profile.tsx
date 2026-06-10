import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from 'react-router';
import { Layout } from "../../components/Layout";
import { Button } from "../../components/ui/Button";
import { useAppStore } from "../../store/useAppStore";
import { useShallow } from 'zustand/react/shallow';
import { ApiError, backendApi } from "../../services/backendApi";
import { CreditPricingModal } from "../credit-pricing/CreditPricingModal";

/** routeKey → 中文活动名映射 */
const ACTIVITY_LABEL_MAP: Record<string, string> = {
  // Step1
  step1_fashion_analysis: "服饰分析",
  step1_fashion_search: "服饰搜索",
  step1_role_preset: "角色预设",
  image_project_step1_selling_points: "卖点提取",
  // Step2
  step2_five_view_generation_child: "五视图生成（儿童）",
  step2_five_view_generation_adult: "五视图生成（成人）",
  // Step3
  step3_realtime_script_generation: "实时热点脚本",
  step3_hot_deep_analysis: "热点深度分析",
  step3_storyboard_image: "分镜图生成",
  step3_storyboard_image_child: "分镜图生成（儿童）",
  step3_storyboard_image_adult: "分镜图生成（成人）",
  step3_storyboard_prompt: "分镜提示词",
  step3_custom_script_generation: "场景化种草脚本",
  step3_custom_script_concept: "场景化脚本概念",
  step3_fashion_script_generation: "时尚大片脚本",
  step3_fashion_script_concept: "时尚大片概念",
  step3_emotion_archetype_generation: "情感原型脚本",
  step3_emotion_archetype_outline: "情感原型大纲",
  script_effectiveness_generation: "种草脚本",
  step3_aesthetic_script_generation: "生活美学脚本",
  step3_product_showcase_script_generation: "产品展示脚本",
  step3_product_showcase_script_concept: "产品展示概念",
  step3_story_theme_concept: "主题叙事构思",
  step3_story_theme_outline: "主题叙事大纲",
  step3_story_theme_generation: "主题叙事分镜",
  step3_resonance_story_concept: "共鸣故事概念",
  step3_resonance_story_generation: "共鸣故事分镜",
  step3_video_script_rewrite: "视频热榜脚本改写",
  step3_library_script_rewrite: "库脚本改写",
  step3_product_showcase_script_rewrite: "产品展示脚本改写",
  script_quality_scoring: "脚本质量评分",
  prompt_evolution_generation: "Prompt进化提案",
  // 图片项目 Step3
  image_project_step3_model_photo: "模特图生成",
  image_project_step3_model_plan: "模特图规划（成人）",
  image_project_step3_model_plan_child: "模特图规划（儿童）",
  // 图片项目 Step4
  // Step4
  step4_clip_video_generation_child: "分镜视频生成（儿童）",
  step4_clip_video_generation_adult: "分镜视频生成（成人）",
  step4_video_export: "视频导出",
  // 裂变
  fission_video_generation_child: "裂变视频生成（儿童）",
  fission_video_generation_adult: "裂变视频生成（成人）",
  fission_story_generation: "裂变故事生成",
  fission_storyboard_prompt: "裂变分镜提示词",
  fission_storyboard_image_child: "裂变分镜图（儿童）",
  fission_storyboard_image_adult: "裂变分镜图（成人）",
  // 广场/热榜
  square_video_reverse: "广场反推",
  square_creator_evaluation: "广场达人评估",
  hot_trend_video_reverse: "热榜反推",
  // 特征库
  aesthetic_feature_extraction: "审美特征提取",
  scene_feature_extraction: "场景特征提取",
  emotion_archetype_extraction: "情感原型提取",
  // 库管理
  library_portrait_detect: "人像检测",
  garment_flat_lay_generation: "服饰平铺图生成",
  // 换装
  outfit_change_image_generation: "换装图片生成",
  outfit_change_video_edit: "换装视频编辑",
  // 音乐
  music_atmosphere_analysis: "音乐氛围分析",
  // 能力实验室
  text_generation: "文本生成",
  image_generation: "图片生成",
  video_generation: "视频生成",
  // 通用
  video_export: "视频导出",
  project_flow_action: "项目流程操作",
  manual_adjust: "手动调账",
};

function translateActivity(activity: string): string {
  return ACTIVITY_LABEL_MAP[activity] ?? activity;
}

export const Profile: React.FC = () => {
  const navigate = useNavigate();
  const { token, currentUser, credits, setCredits, logout } = useAppStore(useShallow((state) => ({ token: state.token, currentUser: state.currentUser, credits: state.credits, setCredits: state.setCredits, logout: state.logout })));
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [loadingData, setLoadingData] = useState(false);
  const [showCreditHistory, setShowCreditHistory] = useState(false);
  const [showCreditPricing, setShowCreditPricing] = useState(false);
  const [creditHistoryLoading, setCreditHistoryLoading] = useState(false);
  const [creditHistoryItems, setCreditHistoryItems] = useState<
    Array<{
      id: string;
      userId: string;
      createdAt: number;
      activity: string;
      success: boolean;
      chargeAmount: number;
      label?: string;
      delta?: number;
    }>
  >([]);
  const [savingPassword, setSavingPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const displayName = useMemo(() => currentUser?.email.split("@")[0] || "N/A", [currentUser?.email]);
  const avatarFallback = useMemo(() => (currentUser?.email?.slice(0, 1).toUpperCase() || "U"), [currentUser?.email]);

  useEffect(() => {
    async function loadMyData() {
      if (!token) return;
      try {
        setLoadingData(true);
        setFeedback(null);
        const creditResp = await backendApi.loadCredits(token);
        setCredits({ balance: creditResp.balance, expiresAt: creditResp.expiresAt });
      } catch (error) {
        const message = error instanceof ApiError ? error.message : "加载账户信息失败";
        setFeedback(message);
      } finally {
        setLoadingData(false);
      }
    }
    void loadMyData();
  }, [token, setCredits]);

  useEffect(() => {
    if (!showCreditHistory || !token) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        setCreditHistoryLoading(true);
        const response = await backendApi.creditHistory(token, 120);
        if (!cancelled) {
          setCreditHistoryItems(response.items ?? []);
        }
      } catch (error) {
        const message = error instanceof ApiError ? error.message : "加载积分消费历史失败";
        if (!cancelled) {
          setFeedback(message);
        }
      } finally {
        if (!cancelled) {
          setCreditHistoryLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showCreditHistory, token]);

  return (
    <Layout>
      {showCreditPricing && <CreditPricingModal onClose={() => setShowCreditPricing(false)} />}
      {showPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-backdrop-fade-in">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md animate-fade-in">
            <h3 className="text-lg font-bold text-gray-900 mb-4">修改登录密码</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">旧密码</label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  className="w-full border border-gray-200 rounded-lg p-2.5 outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">新密码</label>
                <input
                  type="password"
                  value={nextPassword}
                  onChange={(event) => setNextPassword(event.target.value)}
                  className="w-full border border-gray-200 rounded-lg p-2.5 outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">确认新密码</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  className="w-full border border-gray-200 rounded-lg p-2.5 outline-none focus:border-primary"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <Button variant="secondary" onClick={() => setShowPasswordModal(false)}>取消</Button>
              <Button
                isLoading={savingPassword}
                onClick={async () => {
                  if (!token) return;
                  if (!currentPassword || !nextPassword) {
                    setFeedback("请填写完整密码信息");
                    return;
                  }
                  if (nextPassword !== confirmPassword) {
                    setFeedback("新密码与确认密码不一致");
                    return;
                  }
                  try {
                    setSavingPassword(true);
                    setFeedback(null);
                    await backendApi.changePassword(token, { currentPassword, nextPassword });
                    setFeedback("密码修改成功");
                    setCurrentPassword("");
                    setNextPassword("");
                    setConfirmPassword("");
                    setShowPasswordModal(false);
                  } catch (error) {
                    const message = error instanceof ApiError ? error.message : "密码修改失败";
                    setFeedback(message);
                  } finally {
                    setSavingPassword(false);
                  }
                }}
              >
                保存修改
              </Button>
            </div>
          </div>
        </div>
      )}

      {showEditProfile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-backdrop-fade-in">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md animate-fade-in">
            <h3 className="text-lg font-bold text-gray-900 mb-4">编辑个人信息</h3>
            <div className="space-y-4">
              <div className="flex justify-center mb-4">
                <div className="w-20 h-20 rounded-full relative bg-gray-100 border-2 border-gray-100 flex items-center justify-center text-3xl font-bold text-gray-600">
                  {avatarFallback}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">用户名</label>
                <input type="text" defaultValue={displayName} className="w-full border border-gray-200 rounded-lg p-2.5 outline-none focus:border-primary" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">账号</label>
                <input type="text" defaultValue={currentUser?.email || ""} disabled className="w-full border border-gray-200 rounded-lg p-2.5 bg-gray-50 text-gray-500 cursor-not-allowed" />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <Button variant="secondary" onClick={() => setShowEditProfile(false)}>取消</Button>
              <Button onClick={() => setShowEditProfile(false)}>保存</Button>
            </div>
          </div>
        </div>
      )}

      {showCreditHistory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-backdrop-fade-in">
          <div className="w-full max-w-3xl rounded-xl bg-white p-6 shadow-2xl animate-fade-in">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900">积分消费历史</h3>
              <Button variant="secondary" size="sm" onClick={() => setShowCreditHistory(false)}>关闭</Button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto rounded-lg border border-gray-200">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
                  <tr>
                    <th className="px-4 py-3">时间</th>
                    <th className="px-8 py-3 whitespace-nowrap">类别</th>
                    <th className="px-4 py-3">活动</th>
                    <th className="px-8 py-3 whitespace-nowrap">状态</th>
                    <th className="px-4 py-3">变动</th>
                  </tr>
                </thead>
                <tbody>
                  {creditHistoryItems.map((item) => (
                    <tr key={item.id} className="border-t border-gray-100">
                      <td className="px-4 py-3 text-gray-600">{new Date(item.createdAt).toLocaleString("zh-CN")}</td>
                      <td className="px-8 py-3 whitespace-nowrap">
                        <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${item.label === "管理员调账" ? "bg-blue-50 text-blue-700" : "bg-gray-100 text-gray-600"}`}>
                          {item.label ?? "用户消费"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-800">{translateActivity(item.activity)}</td>
                      <td className="px-8 py-3 whitespace-nowrap">
                        <span className={item.success ? "text-green-600" : "text-red-600"}>
                          {item.success ? "成功" : "失败"}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono">
                        {(item.delta ?? -item.chargeAmount) > 0 ? (
                          <span className="text-green-600">+{(item.delta ?? -item.chargeAmount)}积分</span>
                        ) : (
                          <span className="text-red-600">{(item.delta ?? -item.chargeAmount)}积分</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {creditHistoryLoading ? (
                <div className="border-t border-gray-100 px-4 py-4 text-sm text-gray-500">加载中...</div>
              ) : null}
              {!creditHistoryLoading && creditHistoryItems.length < 1 ? (
                <div className="border-t border-gray-100 px-4 py-4 text-sm text-gray-500">暂无积分消费记录。</div>
              ) : null}
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col h-full bg-[#fdfbf7] overflow-y-auto">
        <div className="bg-white border-b border-gray-100 px-8 py-8">
          <div className="max-w-4xl mx-auto">
            <h1 className="text-2xl font-bold text-gray-900 font-display mb-2">账户设置</h1>
            <p className="text-gray-500 text-sm">管理您的个人资料、安全设置和额度信息。</p>
            {feedback && <p className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 mt-3">{feedback}</p>}
          </div>
        </div>

        <div className="flex-1 px-4 md:px-8 py-8">
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
              <div className="flex justify-between items-start mb-6">
                <h2 className="text-lg font-bold text-gray-900">个人资料</h2>
                <Button variant="secondary" size="sm" onClick={() => setShowEditProfile(true)}>
                  <span className="material-icons-round text-sm mr-1">edit</span>编辑
                </Button>
              </div>
              <div className="flex items-center gap-6">
                <div className="w-20 h-20 rounded-full border border-gray-100 bg-gray-100 flex items-center justify-center text-3xl font-bold text-gray-600">
                  {avatarFallback}
                </div>
                <div className="space-y-1">
                  <h3 className="text-xl font-bold text-gray-900">{displayName}</h3>
                  <p className="text-gray-500">{currentUser?.email ?? "N/A"}</p>
                  <div className="flex gap-2 mt-2">
                    <span className="bg-black text-white px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wide">MVP Plan</span>
                    <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-xs font-medium capitalize">{currentUser?.role ?? "user"}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
              <h2 className="text-lg font-bold text-gray-900 mb-6">安全设置</h2>
              <div className="flex items-center justify-between py-4 border-b border-gray-100">
                <div>
                  <div className="font-bold text-gray-800 text-sm">登录密码</div>
                  <div className="text-xs text-gray-500 mt-1">建议定期更换高强度密码</div>
                </div>
                <Button variant="secondary" size="sm" onClick={() => setShowPasswordModal(true)}>修改密码</Button>
              </div>
              <div className="flex items-center justify-between py-4">
                <div>
                  <div className="font-bold text-gray-800 text-sm">双重验证 (2FA)</div>
                  <div className="text-xs text-gray-500 mt-1">暂未启用，预留后续接入</div>
                </div>
                <div className="text-xs text-gray-500">占位</div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-bold text-gray-900">额度与积分</h2>
                <Button variant="outline" size="sm" onClick={() => setShowCreditPricing(true)}>查看定价</Button>
              </div>

              <button
                type="button"
                onClick={() => setShowCreditHistory(true)}
                className="w-full flex items-center justify-between p-4 rounded-lg border border-gray-100 hover:border-gray-200 hover:bg-gray-50/50 transition-colors group"
              >
                <div>
                  <div className="text-sm text-gray-500 mb-1">当前可用积分</div>
                  {loadingData ? (
                    <div className="text-2xl font-bold text-gray-400">加载中...</div>
                  ) : credits?.balance != null ? (
                    <div className="text-2xl font-bold text-gray-900 tabular-nums">
                      {credits.balance.toLocaleString("zh-CN")}
                    </div>
                  ) : (
                    <div className="text-2xl font-bold text-gray-400">N/A</div>
                  )}
                  <div className="text-xs text-gray-400 mt-1">
                    有效期 {credits?.expiresAt ? new Date(credits.expiresAt).toLocaleDateString("zh-CN") : "N/A"}
                  </div>
                </div>
                <span className="material-icons-round text-gray-400 group-hover:text-gray-600 transition-colors">chevron_right</span>
              </button>
            </div>

            <div className="flex justify-center pt-8">
              <button
                onClick={() => {
                  logout();
                  navigate("/");
                }}
                className="text-red-500 font-bold text-sm flex items-center gap-2 hover:bg-red-50 px-6 py-3 rounded-lg transition-colors"
              >
                <span className="material-icons-round">logout</span>退出登录
              </button>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};