import React, { useState, useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { backendApi, ApiError, request } from '../services/backendApi';
import { useAppStore } from '../store/useAppStore';

// 复用登录页动画（登录页 injectAnimations 已注册，这里只确保加载）
const ensureLoginAnimations = () => {
  if (typeof document === 'undefined') return;
  if (document.getElementById('login-animations-v4')) return;
  // 如果登录页尚未加载动画（罕见情况），触发一次
  const style = document.createElement('style');
  style.id = 'login-animations-v4';
  style.textContent = `
    @keyframes electric-flow {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    @keyframes electric-glow {
      0%, 100% { opacity: 0.5; }
      50% { opacity: 1; }
    }
    @keyframes gradient-shift {
      0% { background-position: 0% 50%; }
      50% { background-position: 100% 50%; }
      100% { background-position: 0% 50%; }
    }
    @keyframes particleRise {
      0% { transform: translateY(0) translateX(0) scale(1); opacity: 0; }
      10% { opacity: 1; }
      90% { opacity: 1; }
      100% { transform: translateY(-100vh) translateX(40px) scale(0); opacity: 0; }
    }
    @keyframes pulse-glow {
      0%, 100% { opacity: 0.3; transform: scale(1); }
      50% { opacity: 0.6; transform: scale(1.1); }
    }
    .login-gradient-border {
      position: relative;
      border: none;
      background: transparent;
      overflow: hidden;
    }
    .login-gradient-border::before {
      content: '';
      position: absolute;
      top: -50%;
      left: -50%;
      width: 200%;
      height: 200%;
      background: conic-gradient(
        from 0deg,
        transparent 0deg,
        transparent 80deg,
        rgba(230, 140, 25, 0.15) 100deg,
        rgba(230, 140, 25, 0.4) 130deg,
        rgba(255, 201, 102, 0.8) 155deg,
        rgba(255, 255, 255, 1) 172deg,
        rgba(255, 255, 255, 1) 178deg,
        rgba(255, 201, 102, 0.9) 185deg,
        rgba(230, 140, 25, 0.5) 195deg,
        rgba(230, 140, 25, 0.15) 210deg,
        transparent 240deg,
        transparent 270deg,
        rgba(59, 130, 246, 0.15) 280deg,
        rgba(59, 130, 246, 0.4) 295deg,
        rgba(96, 165, 250, 0.8) 310deg,
        rgba(173, 210, 255, 1) 325deg,
        rgba(173, 210, 255, 1) 330deg,
        rgba(96, 165, 250, 0.9) 338deg,
        rgba(59, 130, 246, 0.5) 345deg,
        rgba(59, 130, 246, 0.1) 352deg,
        transparent 360deg
      );
      animation: electric-flow 3s linear infinite;
      z-index: 0;
      pointer-events: none;
    }
    .login-gradient-border::after {
      content: '';
      position: absolute;
      inset: 2.5px;
      border-radius: 17.5px;
      background: #0a0e1a;
      z-index: 1;
    }
    .login-gradient-border > * {
      position: relative;
      z-index: 2;
    }
    .login-gradient-text {
      background: linear-gradient(135deg, #ffc966, #e68c19, #f5a033, #ffc966);
      background-size: 300% 300%;
      animation: gradient-shift 4s ease infinite;
      -webkit-background-clip: text;
      background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .login-input-glow:focus-within {
      border-color: rgba(230, 140, 25, 0.5) !important;
      box-shadow: 0 0 0 3px rgba(230, 140, 25, 0.1), 0 0 20px rgba(230, 140, 25, 0.15);
    }
    .login-btn-shimmer:hover::after {
      content: '';
      position: absolute;
      inset: 0;
      background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
      animation: shimmer 1.5s ease-in-out;
    }
    .login-particle {
      position: absolute;
      width: 3px;
      height: 3px;
      border-radius: 50%;
      animation: particleRise linear infinite;
    }
    @keyframes shimmer {
      0% { transform: translateX(-100%); }
      100% { transform: translateX(100%); }
    }
    @keyframes input-glow-pulse {
      0%, 100% { opacity: 0.3; box-shadow: inset 0 0 10px rgba(230, 140, 25, 0.04); }
      50% { opacity: 1; box-shadow: inset 0 0 20px rgba(230, 140, 25, 0.1); }
    }
    .login-input-glow:focus-within::after {
      content: '';
      position: absolute;
      inset: -1px;
      border-radius: 10px;
      background: transparent;
      box-shadow: inset 0 0 15px rgba(230, 140, 25, 0.06);
      animation: input-glow-pulse 2s ease-in-out infinite;
      pointer-events: none;
    }
    /* 覆盖浏览器自动填充样式 — 防止浏览器注入默认背景色和文字颜色 */
    input:-webkit-autofill,
    input:-webkit-autofill:hover,
    input:-webkit-autofill:focus,
    input:-webkit-autofill:active {
      -webkit-box-shadow: 0 0 0 1000px #0a0e1a inset !important;
      box-shadow: 0 0 0 1000px #0a0e1a inset !important;
      -webkit-text-fill-color: #e68c19 !important;
      caret-color: #e68c19;
      transition: background-color 5000s ease-in-out 0s;
    }
    .relogin-electric-glow {
      position: absolute;
      inset: -12px;
      border-radius: 32px;
      border: 2px solid rgba(230, 140, 25, 0.1);
      background: rgba(230, 140, 25, 0.02);
      box-shadow:
        0 0 20px rgba(230, 140, 25, 0.3),
        0 0 40px rgba(230, 140, 25, 0.15),
        0 0 55px rgba(230, 140, 25, 0.08),
        inset 0 0 20px rgba(230, 140, 25, 0.1);
      animation: electric-glow 1.5s ease-in-out infinite;
      z-index: 5;
      pointer-events: none;
    }
  `;
  document.head.appendChild(style);
};

// 粒子组件（缩小版）
const ParticleField: React.FC = () => {
  const particles = React.useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 6,
      duration: 6 + Math.random() * 8,
      size: 1 + Math.random() * 2,
      color: ['rgba(230,140,25,0.6)', 'rgba(255,201,102,0.5)', 'rgba(59,130,246,0.4)', 'rgba(16,185,129,0.3)'][i % 4],
    }));
  }, []);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {particles.map(p => (
        <div
          key={p.id}
          className="login-particle"
          style={{
            left: `${p.left}%`,
            bottom: '-5px',
            width: p.size,
            height: p.size,
            backgroundColor: p.color,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
          }}
        />
      ))}
    </div>
  );
};

export const AuthReLoginModal: React.FC = () => {
  // React 19: 使用 useShallow 包装对象 selector
  const {
    authModalVisible,
    authModalLoggingIn,
    hideReLoginModal,
    setSession,
    setAdminToken,
    setAuthModalLoggingIn,
    authModalPendingRetry,
  } = useAppStore(useShallow((state) => ({
    authModalVisible: state.authModalVisible,
    authModalLoggingIn: state.authModalLoggingIn,
    hideReLoginModal: state.hideReLoginModal,
    setSession: state.setSession,
    setAdminToken: state.setAdminToken,
    setAuthModalLoggingIn: state.setAuthModalLoggingIn,
    authModalPendingRetry: state.authModalPendingRetry,
  })));

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  // 预填上次登录的用户名
  const [formData, setFormData] = useState({ email: '', password: '' });

  useEffect(() => {
    ensureLoginAnimations();
    if (authModalVisible) {
      const raw = localStorage.getItem('vogue_ai_user');
      if (raw) {
        try {
          const user = JSON.parse(raw);
          if (user?.email) {
            setFormData(prev => ({ ...prev, email: user.email }));
          }
        } catch { /* ignore */ }
      }
    } else {
      // 弹窗关闭时重置错误和状态，但如果正在登录中则不重置
      if (!authModalLoggingIn) {
        setError(null);
        setLoading(false);
        setFormData(prev => ({ ...prev, password: '' }));
      }
    }
  }, [authModalVisible, authModalLoggingIn]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    // 标记正在登录中，防止弹窗被关闭或重复触发
    setAuthModalLoggingIn(true);
    try {
      const payload = await backendApi.login(formData.email, formData.password);
      setSession(payload.token, payload.user);
      if (payload.user.role === 'admin') {
        setAdminToken(payload.token);
      }

      // 登录成功，先重置登录中状态
      setAuthModalLoggingIn(false);

      // 保存当前 pending retry 信息（在 hideReLoginModal 之前获取）
      const pendingRetry = useAppStore.getState().authModalPendingRetry;

      // 登录成功后，关闭弹窗
      hideReLoginModal();

      // 立即重试原始 401 请求，使用更新后的 token
      if (pendingRetry) {
        try {
          const { method, path, body } = pendingRetry;
          // 重试请求跳过 401 弹窗，防止登录成功后重试失败再次弹出
          await request(method, path, body ? { body, skipAuthModal: true } : { skipAuthModal: true });
        } catch (retryErr) {
          // 重试失败不再触发弹窗（skipAuthModal=true）
        }
      }
    } catch (err) {
      const message = err instanceof ApiError ? err.message : '登录失败，请稍后重试';
      setError(message);
      setLoading(false);
      // 登录失败，重置登录中状态，允许用户再次尝试
      setAuthModalLoggingIn(false);
    }
  };

  if (!authModalVisible) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="重新登录"
    >
      {/* 遮罩层 */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={() => {
          // 点击遮罩不关闭，防止误触
        }}
      />

      {/* 粒子场 */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-0" style={{
          background: 'radial-gradient(ellipse at center, rgba(230,140,25,0.06) 0%, transparent 70%)',
          animation: 'pulse-glow 6s ease-in-out infinite',
        }} />
      </div>
      <ParticleField />

      {/* 卡片容器 */}
      <div className="relative z-10 w-full max-w-[400px] mx-4">
        {/* 发光层 */}
        <div className="relogin-electric-glow" />

        {/* 电流边框卡片 */}
        <div className="login-gradient-border rounded-[20px] p-7 backdrop-blur-xl">
          {/* 关闭按钮 */}
          <button
            onClick={() => {
              // 关闭弹窗但不清除状态，用户下次触发 401 时还会弹出
              hideReLoginModal();
            }}
            disabled={loading}
            className={`absolute top-3 right-3 z-[3] w-7 h-7 rounded-full flex items-center justify-center transition-colors ${
              loading
                ? 'bg-white/5 cursor-not-allowed opacity-30'
                : 'bg-white/5 hover:bg-white/10'
            }`}
            aria-label="关闭"
          >
            <svg className={`w-4 h-4 transition-colors ${
              loading
                ? 'text-white/20'
                : 'text-white/40 hover:text-white/70'
            }`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>

          {/* 标题 */}
          <div className="flex flex-col items-center gap-2 mb-7">
            <div className="flex items-center gap-2">
              <img src="/logo.png" alt="内容喵" className="w-8 h-8 object-contain" loading="eager" />
              <span className="text-xl font-bold login-gradient-text">内容喵</span>
            </div>
            <div className="w-20 h-[2px] relative">
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#e68c19] to-transparent" />
            </div>
            <h3 className="text-lg font-bold text-white/90">会话已过期</h3>
            <p className="text-xs text-white/40">请重新登录以继续使用</p>
          </div>

          {/* 表单 */}
          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="relogin-email" className="text-xs font-medium text-[#e68c19]/60">
                邮箱 / 用户名
              </label>
              <div className="login-input-glow relative flex items-center h-[44px] rounded-lg border border-[#e68c19]/20 bg-transparent px-3 gap-2 transition-all duration-300">
                <svg className={`w-4 h-4 shrink-0 transition-all duration-300 ${
                  focusedField === 'email' ? 'text-[#e68c19]' : 'text-[#e68c19]/40'
                }`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="4" width="20" height="16" rx="2" />
                  <path d="M22 4L12 13 2 4" />
                </svg>
                <input
                  id="relogin-email" name="email" type="text" required
                  placeholder="输入邮箱或用户名"
                  value={formData.email} onChange={handleChange}
                  onFocus={() => setFocusedField('email')}
                  onBlur={() => setFocusedField(null)}
                  className="flex-1 bg-transparent text-sm outline-none placeholder:text-[#e68c19]/25 text-[#e68c19]"
                  autoFocus
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="relogin-password" className="text-xs font-medium text-[#e68c19]/60">
                密码
              </label>
              <div className="login-input-glow relative flex items-center h-[44px] rounded-lg border border-[#e68c19]/20 bg-transparent px-3 gap-2 transition-all duration-300">
                <svg className={`w-4 h-4 shrink-0 transition-all duration-300 ${
                  focusedField === 'password' ? 'text-[#e68c19]' : 'text-[#e68c19]/40'
                }`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                <input
                  id="relogin-password" name="password" type={showPassword ? "text" : "password"} required
                  placeholder="输入密码"
                  value={formData.password} onChange={handleChange}
                  onFocus={() => setFocusedField('password')}
                  onBlur={() => setFocusedField(null)}
                  className="flex-1 bg-transparent text-sm outline-none placeholder:text-[#e68c19]/25 text-[#e68c19]"
                />
                <svg
                  className="w-4 h-4 shrink-0 text-[#e68c19]/30 cursor-pointer hover:text-[#e68c19]/50 transition-colors"
                  viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <>
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </>
                  ) : (
                    <>
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </>
                  )}
                </svg>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className={`login-btn-shimmer relative mt-1 w-full h-[44px] rounded-lg text-sm font-semibold text-white transition-all duration-300 overflow-hidden ${
                loading ? 'opacity-60 cursor-not-allowed'
                  : 'hover:shadow-[0_6px_24px_rgba(230,140,25,0.35)] active:translate-y-px'
              }`}
              style={{
                background: 'linear-gradient(135deg, #c97108 0%, #e68c19 35%, #f5a033 65%, #ffc966 100%)',
                backgroundSize: '200% 200%',
                animation: 'gradient-shift 3s ease infinite',
              }}
            >
              <span className="relative z-[3]">
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    登录中...
                  </span>
                ) : (
                  '重新登录 →'
                )}
              </span>
            </button>

            {error && (
              <div className="px-3 py-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg backdrop-blur-sm">
                {error}
              </div>
            )}
          </form>
        </div>

        {/* 底部安心提示 */}
        <div className="text-center mt-3 text-[11px] text-white/20">
          您的工作进度已保留，登录后可继续
        </div>
      </div>
    </div>
  );
};
