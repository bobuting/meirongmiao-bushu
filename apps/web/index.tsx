import React from 'react';
import ReactDOM from 'react-dom/client';
import "@fontsource/inter/latin-300.css";
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-500.css";
import "@fontsource/inter/latin-600.css";
import "@fontsource/inter/latin-700.css";
import "@fontsource/material-icons-round";
import "@fontsource/noto-sans-sc/chinese-simplified-300.css";
import "@fontsource/noto-sans-sc/chinese-simplified-400.css";
import "@fontsource/noto-sans-sc/chinese-simplified-500.css";
import "@fontsource/noto-sans-sc/chinese-simplified-700.css";
import '@uiw/react-md-editor/markdown-editor.css';
import './index.css';
import App from './App';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  // <React.StrictMode>
    <App />
  // </React.StrictMode>
);

// 移除加载遮罩 - 由 App.tsx 的 useEffect 统一处理
// 这里只作为备用，确保即使 App 没有挂载也能移除遮罩
window.addEventListener('load', () => {
  setTimeout(() => {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
      overlay.classList.add('hidden');
      setTimeout(() => overlay.remove(), 300);
    }
  }, 2000); // 2秒后强制移除，作为备用
});
