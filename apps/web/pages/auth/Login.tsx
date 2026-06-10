import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { backendApi, ApiError } from '../../services/backendApi';
import { useAppStore } from '../../store/useAppStore';
import { useShallow } from 'zustand/react/shallow';

// 动画样式注入（只执行一次）
const injectAnimations = () => {
  if (typeof document === 'undefined') return;
  if (document.getElementById('login-animations-v4')) return;
  // 清理旧版本
  const oldStyle = document.getElementById('login-animations');
  if (oldStyle) oldStyle.remove();
  const oldStyle2 = document.getElementById('login-animations-v2');
  if (oldStyle2) oldStyle2.remove();
  const oldStyle3 = document.getElementById('login-animations-v3');
  if (oldStyle3) oldStyle3.remove();
  const style = document.createElement('style');
  style.id = 'login-animations-v4';
  style.textContent = `
    @keyframes float {
      0%, 100% { transform: translateY(0) translateX(0); }
      25% { transform: translateY(-20px) translateX(10px); }
      50% { transform: translateY(-10px) translateX(-15px); }
      75% { transform: translateY(-30px) translateX(5px); }
    }
    @keyframes floatSlow {
      0%, 100% { transform: translateY(0) translateX(0) rotate(0deg); }
      33% { transform: translateY(-25px) translateX(15px) rotate(120deg); }
      66% { transform: translateY(10px) translateX(-20px) rotate(240deg); }
    }
    @keyframes pulse-glow {
      0%, 100% { opacity: 0.3; transform: scale(1); }
      50% { opacity: 0.6; transform: scale(1.1); }
    }
    @keyframes gradient-shift {
      0% { background-position: 0% 50%; }
      50% { background-position: 100% 50%; }
      100% { background-position: 0% 50%; }
    }
    @keyframes orbit {
      0% { transform: rotate(0deg) translateX(120px) rotate(0deg); }
      100% { transform: rotate(360deg) translateX(120px) rotate(-360deg); }
    }
    @keyframes orbit2 {
      0% { transform: rotate(60deg) translateX(160px) rotate(-60deg); }
      100% { transform: rotate(420deg) translateX(160px) rotate(-420deg); }
    }
    @keyframes shimmer {
      0% { transform: translateX(-100%); }
      100% { transform: translateX(100%); }
    }
    @keyframes borderGlow {
      0%, 100% { border-color: rgba(230, 140, 25, 0.3); box-shadow: 0 0 15px rgba(230, 140, 25, 0.1); }
      50% { border-color: rgba(230, 140, 25, 0.6); box-shadow: 0 0 25px rgba(230, 140, 25, 0.2); }
    }
    @keyframes particleRise {
      0% { transform: translateY(0) translateX(0) scale(1); opacity: 0; }
      10% { opacity: 1; }
      90% { opacity: 1; }
      100% { transform: translateY(-100vh) translateX(40px) scale(0); opacity: 0; }
    }
    @keyframes textGlow {
      0%, 100% { text-shadow: 0 0 20px rgba(230, 140, 25, 0.3); }
      50% { text-shadow: 0 0 40px rgba(230, 140, 25, 0.6), 0 0 60px rgba(230, 140, 25, 0.3); }
    }
    @keyframes dataFlow {
      0% { transform: translateY(-100%); opacity: 0; }
      5% { opacity: 1; }
      95% { opacity: 1; }
      100% { transform: translateY(100%); opacity: 0; }
    }
    .login-data-stream {
      position: absolute;
      width: 1px;
      background: linear-gradient(to bottom, transparent, rgba(230, 140, 25, 0.08), rgba(255, 201, 102, 0.12), rgba(230, 140, 25, 0.08), transparent);
      animation: dataFlow linear infinite;
      pointer-events: none;
    }
    .login-gradient-text {
      background: linear-gradient(135deg, #ffc966, #e68c19, #f5a033, #ffc966);
      background-size: 300% 300%;
      animation: gradient-shift 4s ease infinite;
      -webkit-background-clip: text;
      background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    @keyframes electric-flow {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    @keyframes electric-flow-reverse {
      0% { transform: rotate(360deg); }
      100% { transform: rotate(0deg); }
    }
    @keyframes electric-glow {
      0%, 100% { opacity: 0.5; }
      50% { opacity: 1; }
    }
    .login-gradient-border {
      position: relative;
      border: none;
      background: transparent;
      overflow: hidden;
    }
    /* 双层电流 — 在同一个旋转渐变中合并橙色和蓝色光束 */
    .login-gradient-border::before {
      content: '';
      position: absolute;
      top: -50%;
      left: -50%;
      width: 200%;
      height: 200%;
      background: conic-gradient(
        from 0deg,
        /* 橙色主电流光束（带头部高亮和拖尾） */
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
        /* 蓝色反向电流光束（完全在 270-350deg 范围内） */
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
    /* 内层遮罩 — 盖住中间，只留边框 */
    .login-gradient-border::after {
      content: '';
      position: absolute;
      inset: 2.5px;
      border-radius: 21.5px;
      background: #0a0e1a;
      z-index: 1;
    }
    /* 确保内容在边框上层 */
    .login-gradient-border > * {
      position: relative;
      z-index: 2;
    }
    /* 发光层 — 卡片外围光晕 */
    .electric-glow-layer {
      position: absolute;
      inset: -16px;
      border-radius: 36px;
      border: 2px solid rgba(230, 140, 25, 0.1);
      background: rgba(230, 140, 25, 0.02);
      box-shadow:
        0 0 25px rgba(230, 140, 25, 0.3),
        0 0 50px rgba(230, 140, 25, 0.15),
        0 0 70px rgba(230, 140, 25, 0.08),
        inset 0 0 25px rgba(230, 140, 25, 0.1);
      animation: electric-glow 1.5s ease-in-out infinite;
      z-index: 5;
      pointer-events: none;
    }
    .electric-reverse {
      display: none;
    }
    .login-input-glow:focus-within {
      border-color: rgba(230, 140, 25, 0.5) !important;
      box-shadow: 0 0 0 3px rgba(230, 140, 25, 0.1), 0 0 20px rgba(230, 140, 25, 0.15);
    }
    .login-input-glow:focus-within::after {
      content: '';
      position: absolute;
      inset: -1px;
      border-radius: 12px;
      background: transparent;
      box-shadow: inset 0 0 15px rgba(230, 140, 25, 0.06);
      animation: input-glow-pulse 2s ease-in-out infinite;
      pointer-events: none;
    }
    @keyframes input-glow-pulse {
      0%, 100% { opacity: 0.3; box-shadow: inset 0 0 10px rgba(230, 140, 25, 0.04); }
      50% { opacity: 1; box-shadow: inset 0 0 20px rgba(230, 140, 25, 0.1); }
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
  `;
  document.head.appendChild(style);
};

// 粒子组件
const ParticleField: React.FC = () => {
  const particles = useMemo(() => {
    return Array.from({ length: 30 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 10,
      duration: 8 + Math.random() * 12,
      size: 1 + Math.random() * 3,
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

// 浮动几何体
const FloatingShapes: React.FC = () => (
  <div className="absolute inset-0 overflow-hidden pointer-events-none">
    <div
      className="absolute top-[20%] left-[15%] w-48 h-48 rounded-full border border-[#e68c19]/20"
      style={{ animation: 'float 8s ease-in-out infinite' }}
    />
    <div
      className="absolute top-[60%] left-[60%] w-32 h-32 rounded-full border border-blue-500/15"
      style={{ animation: 'floatSlow 12s ease-in-out infinite' }}
    />
    <div
      className="absolute top-[30%] right-[25%] w-6 h-6 rounded-sm bg-[#e68c19]/10 rotate-45"
      style={{ animation: 'float 6s ease-in-out infinite 1s' }}
    />
    <div
      className="absolute bottom-[25%] left-[30%] w-4 h-4 rounded-sm bg-emerald-500/10 rotate-12"
      style={{ animation: 'floatSlow 9s ease-in-out infinite 2s' }}
    />
    <div
      className="absolute top-[15%] right-[35%] w-0 h-0"
      style={{
        borderLeft: '12px solid transparent',
        borderRight: '12px solid transparent',
        borderBottom: '20px solid rgba(59,130,246,0.15)',
        animation: 'float 10s ease-in-out infinite 0.5s',
      }}
    />
    <div className="absolute top-[45%] left-[40%] w-2 h-2 rounded-full bg-[#e68c19]/40"
      style={{ animation: 'orbit 15s linear infinite' }}
    />
    <div className="absolute top-[45%] left-[40%] w-1.5 h-1.5 rounded-full bg-blue-400/30"
      style={{ animation: 'orbit2 20s linear infinite' }}
    />
  </div>
);

// 连线网络（SVG）
const NetworkLines: React.FC = () => (
  <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-[0.06]" viewBox="0 0 800 600" fill="none" stroke="white" strokeWidth="0.5">
    <line x1="100" y1="100" x2="300" y2="200" />
    <line x1="300" y1="200" x2="500" y2="150" />
    <line x1="500" y1="150" x2="700" y2="300" />
    <line x1="100" y1="100" x2="200" y2="400" />
    <line x1="300" y1="200" x2="200" y2="400" />
    <line x1="200" y1="400" x2="400" y2="500" />
    <line x1="500" y1="150" x2="600" y2="450" />
    <line x1="700" y1="300" x2="600" y2="450" />
    <line x1="400" y1="500" x2="600" y2="450" />
    <circle cx="100" cy="100" r="3" fill="rgba(230,140,25,0.5)" stroke="none" />
    <circle cx="300" cy="200" r="3" fill="rgba(230,140,25,0.5)" stroke="none" />
    <circle cx="500" cy="150" r="3" fill="rgba(59,130,246,0.5)" stroke="none" />
    <circle cx="700" cy="300" r="3" fill="rgba(59,130,246,0.5)" stroke="none" />
    <circle cx="200" cy="400" r="3" fill="rgba(16,185,129,0.5)" stroke="none" />
    <circle cx="400" cy="500" r="3" fill="rgba(16,185,129,0.5)" stroke="none" />
    <circle cx="600" cy="450" r="3" fill="rgba(230,140,25,0.5)" stroke="none" />
  </svg>
);

// 数据流（类似矩阵雨的 subtle 版本）
const DataStreams: React.FC = () => {
  const streams = useMemo(() => {
    return Array.from({ length: 15 }, (_, i) => ({
      id: i,
      left: 3 + (i * 6.3) + Math.random() * 3,
      delay: Math.random() * 10,
      duration: 5 + Math.random() * 8,
      height: 60 + Math.random() * 120,
      width: 1 + Math.random() * 1.5,
      opacity: 0.4 + Math.random() * 0.6,
    }));
  }, []);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {streams.map(s => (
        <div
          key={s.id}
          className="login-data-stream"
          style={{
            left: `${s.left}%`,
            width: s.width,
            height: s.height,
            opacity: s.opacity,
            animationDelay: `${s.delay}s`,
            animationDuration: `${s.duration}s`,
          }}
        />
      ))}
    </div>
  );
};

export const Login: React.FC = () => {
  const navigate = useNavigate();
  const { setSession, setAdminToken } = useAppStore(useShallow((state) => ({ setSession: state.setSession, setAdminToken: state.setAdminToken })));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [deviceWarning, setDeviceWarning] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });

  useEffect(() => { injectAnimations(); }, []);

  // 检测设备类型和浏览器
  useEffect(() => {
    if (typeof navigator === 'undefined') return;
    const ua = navigator.userAgent;
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua) || window.innerWidth < 768;
    const isChrome = /Chrome/i.test(ua) && !/Edge|Edg|OPR|Opera/i.test(ua);

    if (isMobile) {
      setDeviceWarning('检测到您正在使用手机访问，部分功能可能无法正常使用。建议使用 PC 端 Chrome 浏览器，享受完整创作体验。');
    } else if (!isChrome) {
      setDeviceWarning('检测到当前浏览器可能不是 Chrome，建议使用 Chrome 浏览器以获得最佳体验。');
    }
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const payload = await backendApi.login(formData.email, formData.password);
      setSession(payload.token, payload.user);
      if (payload.user.role === 'admin') {
        setAdminToken(payload.token);
      }
      setLoading(false);
      window.location.hash = '/dashboard';
      navigate('/dashboard');
    } catch (err) {
      const message = err instanceof ApiError ? err.message : '登录失败，请稍后重试';
      setError(message);
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen w-full font-sans">
      {/* 全局统一背景 — 消除左右分界线 */}
      <div className="fixed inset-0 bg-gradient-to-br from-[#06080f] via-[#080d18] to-[#0a0e1a]" />

      {/* ========== 左侧品牌区域 ========== */}
      <div className="relative hidden lg:flex lg:w-[60%] overflow-hidden z-[1]">
        {/* 深色渐变背景已由全局 fixed 层提供 */}

        {/* 网格点阵 */}
        <div className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.8) 1px, transparent 1px)',
            backgroundSize: '40px 40px'
          }}
        />

        {/* 数据流 */}
        <DataStreams />

        {/* 连线网络 */}
        <NetworkLines />

        {/* 粒子上升 */}
        <ParticleField />

        {/* 浮动几何体 */}
        <FloatingShapes />

        {/* 主发光区域 */}
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] rounded-full"
          style={{
            background: 'radial-gradient(circle, rgba(230,140,25,0.12) 0%, rgba(230,140,25,0.04) 40%, transparent 70%)',
            animation: 'pulse-glow 6s ease-in-out infinite',
          }}
        />

        {/* 副发光 — 蓝色 */}
        <div
          className="absolute top-[20%] right-[10%] w-[400px] h-[400px] rounded-full"
          style={{
            background: 'radial-gradient(circle, rgba(59,130,246,0.08) 0%, transparent 70%)',
            animation: 'pulse-glow 8s ease-in-out infinite 2s',
          }}
        />

        {/* 底部发光 — 绿色 */}
        <div
          className="absolute bottom-[10%] left-[20%] w-[350px] h-[350px] rounded-full"
          style={{
            background: 'radial-gradient(circle, rgba(16,185,129,0.06) 0%, transparent 70%)',
            animation: 'pulse-glow 7s ease-in-out infinite 4s',
          }}
        />

        {/* 右边缘融合渐变 — 让分界线消失 */}
        <div
          className="absolute top-0 right-0 w-72 h-full pointer-events-none"
          style={{
            background: 'linear-gradient(to right, transparent 0%, rgba(6,8,15,0.5) 30%, rgba(6,8,15,0.9))',
            zIndex: 10,
          }}
        />

        {/* 品牌内容 */}
        <div className="relative z-10 flex flex-col items-center justify-center w-full px-16 xl:px-24 gap-8">
          {/* Logo + 品牌名 */}
          <div className="flex items-center gap-5">
            <div className="relative">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#e68c19]/30 to-[#e68c19]/5 border border-[#e68c19]/30 flex items-center justify-center overflow-hidden"
                style={{ animation: 'borderGlow 3s ease-in-out infinite' }}
              >
                <img src="/logo.png" alt="内容喵" className="w-14 h-14 object-contain" loading="eager" />
              </div>
              <div className="absolute -inset-2 rounded-3xl bg-[#e68c19]/5 blur-xl"
                style={{ animation: 'pulse-glow 4s ease-in-out infinite' }}
              />
            </div>
            <span className="text-5xl font-bold login-gradient-text">内容喵</span>
          </div>

          {/* 主标题 */}
          <h1 className="text-6xl font-bold text-white text-center leading-tight tracking-normal"
            style={{ animation: 'textGlow 4s ease-in-out infinite' }}
          >
            电商AI最后一公里
          </h1>

          {/* 发光分隔线 */}
          <div className="relative w-32 h-[2px]">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#e68c19] to-transparent" />
            <div className="absolute inset-0 h-[2px] bg-[#e68c19] blur-sm" />
          </div>

          {/* 副标题 */}
          <p className="text-xl text-white/50 text-center leading-relaxed max-w-lg">
            从灵感到成片，全链路工作流闭环
          </p>

          {/* 数据指标 */}
          <div className="flex items-center gap-10 mt-4">
            <div className="text-center">
              <div className="text-3xl font-bold text-[#e68c19]">6</div>
              <div className="text-xs text-white/40 mt-1">步工作流</div>
            </div>
            <div className="w-px h-10 bg-white/10" />
            <div className="text-center">
              <div className="text-3xl font-bold text-blue-400">4K</div>
              <div className="text-xs text-white/40 mt-1">超清画质</div>
            </div>
            <div className="w-px h-10 bg-white/10" />
            <div className="text-center">
              <div className="text-3xl font-bold text-emerald-400">10x</div>
              <div className="text-xs text-white/40 mt-1">效率提升</div>
            </div>
          </div>

          {/* 功能标签 */}
          <div className="flex items-center gap-3 mt-4">
            <div className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#e68c19]/10 border border-[#e68c19]/20 backdrop-blur-sm">
              <svg className="w-4 h-4 text-[#ffc966]" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2l2.4 7.2H22l-6 4.8 2.4 7.2L12 16.4l-6.4 4.8 2.4-7.2-6-4.8h7.6z" />
              </svg>
              <span className="text-sm text-white/70">AI 智能生成</span>
            </div>
            <div className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-blue-500/10 border border-blue-500/20 backdrop-blur-sm">
              <svg className="w-4 h-4 text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
              <span className="text-sm text-white/70">视频反推</span>
            </div>
            <div className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 backdrop-blur-sm">
              <svg className="w-4 h-4 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="2" width="20" height="20" rx="2" />
                <path d="M7 2v20M17 2v20M2 12h20" />
              </svg>
              <span className="text-sm text-white/70">分镜精控</span>
            </div>
          </div>
        </div>
      </div>

      {/* ========== 右侧登录区域 ========== */}
      <div className="flex-1 flex items-center justify-center relative overflow-hidden z-[1]">
        {/* 右侧装饰光 */}
        <div className="absolute top-0 right-0 w-96 h-96 rounded-full bg-[#e68c19]/5 blur-3xl" />
        <div className="absolute bottom-0 left-0 w-80 h-80 rounded-full bg-blue-500/5 blur-3xl" />

        <div className="relative z-10 w-full max-w-md px-6">
          {/* 设备/浏览器提示 — 优雅毛玻璃卡片 */}
          {deviceWarning && (
            <div
              className="mb-6 px-5 py-4 rounded-2xl border backdrop-blur-md transition-all duration-500"
              style={{
                background: 'linear-gradient(135deg, rgba(230,140,25,0.06) 0%, rgba(255,201,102,0.03) 100%)',
                borderColor: 'rgba(230,140,25,0.2)',
                boxShadow: '0 4px 20px rgba(230,140,25,0.08), inset 0 1px 0 rgba(255,255,255,0.03)',
              }}
            >
              <div className="flex items-start gap-3">
                {/* 图标 — 脉冲呼吸 */}
                <div className="relative shrink-0 mt-0.5">
                  <svg className="w-5 h-5" style={{ color: '#ffc966' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
                    <line x1="12" y1="18" x2="12.01" y2="18" />
                  </svg>
                  <div
                    className="absolute -inset-1 rounded-full"
                    style={{
                      background: 'radial-gradient(circle, rgba(255,201,102,0.15) 0%, transparent 70%)',
                      animation: 'pulse-glow 3s ease-in-out infinite',
                    }}
                  />
                </div>
                {/* 文字 */}
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium leading-relaxed" style={{ color: 'rgba(255,201,102,0.85)' }}>
                    {deviceWarning}
                  </p>
                </div>
                {/* 关闭 */}
                <button
                  onClick={() => setDeviceWarning(null)}
                  className="shrink-0 p-1 rounded-lg transition-colors duration-200"
                  style={{ color: 'rgba(230,140,25,0.3)' }}
                  onMouseEnter={e => { e.currentTarget.style.color = 'rgba(230,140,25,0.6)'; e.currentTarget.style.background = 'rgba(230,140,25,0.08)'; }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'rgba(230,140,25,0.3)'; e.currentTarget.style.background = 'transparent'; }}
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            </div>
          )}

          {/* 外层 wrapper：电晕 + 卡片 */}
          <div className="relative">
            <div className="electric-glow-layer" />
            {/* 登录卡片 — 电流边框 */}
            <div
              className="login-gradient-border rounded-[24px] p-10 backdrop-blur-xl transition-all duration-500 hover:-translate-y-1 hover:shadow-[0_12px_40px_rgba(0,0,0,0.3),0_0_60px_rgba(230,140,25,0.08)]"
            >
              {/* 标题区 */}
            <div className="flex flex-col items-center gap-3 mb-10">
              <div className="flex items-center gap-3 mb-2 lg:hidden">
                <img src="/logo.png" alt="内容喵" className="w-14 h-14 object-contain" loading="eager" />
                <span className="text-3xl font-bold login-gradient-text">内容喵</span>
              </div>
              <h2 className="text-[32px] font-bold login-gradient-text text-center">
                欢迎回来
              </h2>
              <p className="text-sm text-white/40 text-center">
                输入您的凭据以访问创作工作室
              </p>
            </div>

            {/* 表单 */}
            <form onSubmit={handleLogin} className="flex flex-col gap-6">
              <div className="flex flex-col gap-2">
                <label htmlFor="email" className="text-sm font-medium text-[#e68c19]/60">
                  邮箱 / 用户名
                </label>
                <div className={`login-input-glow relative flex items-center h-[52px] rounded-xl border border-[#e68c19]/20 bg-transparent px-4 gap-3 transition-all duration-300`}>
                  <svg className={`w-[18px] h-[18px] shrink-0 transition-all duration-300 ${
                    focusedField === 'email' ? 'text-[#e68c19]' : 'text-[#e68c19]/40'
                  }`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="4" width="20" height="16" rx="2" />
                    <path d="M22 4L12 13 2 4" />
                  </svg>
                  <input
                    id="email" name="email" type="text" required autoComplete="username"
                    placeholder="输入邮箱或用户名"
                    value={formData.email} onChange={handleChange}
                    onFocus={() => setFocusedField('email')}
                    onBlur={() => setFocusedField(null)}
                    className="flex-1 bg-transparent text-base outline-none placeholder:text-[#e68c19]/25 text-[#e68c19]"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <label htmlFor="password" className="text-sm font-medium text-[#e68c19]/60">
                  密码
                </label>
                <div className={`login-input-glow relative flex items-center h-[52px] rounded-xl border border-[#e68c19]/20 bg-transparent px-4 gap-3 transition-all duration-300`}>
                  <svg className={`w-[18px] h-[18px] shrink-0 transition-all duration-300 ${
                    focusedField === 'password' ? 'text-[#e68c19]' : 'text-[#e68c19]/40'
                  }`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                  <input
                    id="password" name="password" type={showPassword ? "text" : "password"} required autoComplete="current-password"
                    placeholder="输入密码"
                    value={formData.password} onChange={handleChange}
                    onFocus={() => setFocusedField('password')}
                    onBlur={() => setFocusedField(null)}
                    className="flex-1 bg-transparent text-base outline-none placeholder:text-[#e68c19]/25 text-[#e68c19]"
                  />
                  <svg
                    className="w-[18px] h-[18px] shrink-0 text-[#e68c19]/30 cursor-pointer hover:text-[#e68c19]/50 transition-colors"
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

              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer group">
                  <div
                    className={`w-4 h-4 rounded border transition-all duration-200 flex items-center justify-center cursor-pointer ${
                      rememberMe
                        ? 'border-[#e68c19] bg-[#e68c19]/20'
                        : 'border-white/10 bg-white/5 group-hover:border-white/20'
                    }`}
                    onClick={() => setRememberMe(!rememberMe)}
                  >
                    {rememberMe && (
                      <svg className="w-3 h-3 text-[#e68c19]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </div>
                  <span className="text-sm text-white/40">记住设备</span>
                </label>
                <span className="text-sm text-[#e68c19] cursor-pointer hover:text-[#ffc966] transition-colors">
                  忘记密码？
                </span>
              </div>

              <button
                type="submit"
                disabled={loading}
                className={`login-btn-shimmer relative mt-1 w-full h-[52px] rounded-xl text-base font-semibold text-white transition-all duration-300 overflow-hidden ${
                  loading ? 'opacity-60 cursor-not-allowed'
                    : 'hover:shadow-[0_8px_30px_rgba(230,140,25,0.35),0_0_40px_rgba(230,140,25,0.15)] hover:-translate-y-0.5 active:translate-y-0'
                }`}
                style={{
                  background: 'linear-gradient(135deg, #c97108 0%, #e68c19 35%, #f5a033 65%, #ffc966 100%)',
                  backgroundSize: '200% 200%',
                  animation: 'gradient-shift 3s ease infinite',
                }}
              >
                <span className="relative z-10">
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      登录中...
                    </span>
                  ) : (
                    '进入控制台 →'
                  )}
                </span>
              </button>

              {error && (
                <div className="px-4 py-3 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl backdrop-blur-sm">
                  {error}
                </div>
              )}
            </form>
          </div>
          </div> {/* closing electric-glow-layer wrapper */}

          {/* 系统状态 */}
          <div className="flex items-center justify-center gap-8 mt-10">
            <div className="flex items-center gap-2">
              <div className="relative">
                <div className="w-2 h-2 rounded-full bg-emerald-500" />
                <div className="absolute inset-0 w-2 h-2 rounded-full bg-emerald-500 animate-ping opacity-40" />
              </div>
              <span className="text-xs text-white/30">系统运行正常</span>
            </div>
            <div className="flex items-center gap-2">
              <svg className="w-3 h-3 text-emerald-500/60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              <span className="text-xs text-white/30">256 位加密传输</span>
            </div>
          </div>

          <div className="text-center mt-12 text-[11px] text-white/20 leading-relaxed">
            <div>&copy; 2026 杭州内容喵科技有限公司 版权所有 v0521</div>
            <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer"
              className="text-white/15 hover:text-white/30 transition-colors no-underline">
              浙ICP备2026010329号-2
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
