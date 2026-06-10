/**
 * 用户表单弹窗组件
 * 支持新增和编辑用户
 */
import React, { useState, useEffect } from "react";

export interface UserFormData {
  email: string;
  password: string;
  role: "admin" | "user";
  companyName: string;
  initialCredits?: number;
}

interface UserFormModalProps {
  open: boolean;
  user: {
    id: string;
    email: string;
    role: "admin" | "user";
    companyName?: string;
  } | null;
  onClose: () => void;
  onSubmit: (data: UserFormData) => void | Promise<void>;
  isLoading: boolean;
}

export const UserFormModal: React.FC<UserFormModalProps> = ({
  open,
  user,
  onClose,
  onSubmit,
  isLoading,
}) => {
  const [formData, setFormData] = useState<UserFormData>({
    email: "",
    password: "",
    role: "user",
    companyName: "",
    initialCredits: 1500,
  });
  const [errors, setErrors] = useState<Partial<Record<keyof UserFormData, string>>>({});

  // 编辑模式初始化表单
  useEffect(() => {
    if (user) {
      setFormData({
        email: user.email,
        password: "",
        role: user.role,
        companyName: user.companyName || "",
        initialCredits: undefined,
      });
    } else {
      setFormData({
        email: "",
        password: "",
        role: "user",
        companyName: "",
        initialCredits: 1500,
      });
    }
    setErrors({});
  }, [user, open]);

  const validate = (): boolean => {
    const newErrors: Partial<Record<keyof UserFormData, string>> = {};

    // 用户名验证
    if (!formData.email.trim()) {
      newErrors.email = "请输入用户名";
    } else if (formData.email.trim().length < 4) {
      newErrors.email = "用户名至少4个字符";
    }

    // 密码验证（新增时必填，编辑时可选）
    if (!user) {
      if (!formData.password) {
        newErrors.password = "请输入密码";
      } else if (formData.password.length < 6) {
        newErrors.password = "密码至少6位";
      }
    } else if (formData.password && formData.password.length < 6) {
      newErrors.password = "密码至少6位";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    onSubmit(formData);
  };

  const handleChange = (field: keyof UserFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* 背景遮罩 */}
      <div className="fixed inset-0 bg-black bg-opacity-50 transition-opacity" onClick={onClose} />

      {/* 弹窗容器 */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative bg-white rounded-lg shadow-xl w-full max-w-md">
          {/* 头部 */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">
              {user ? "编辑用户" : "新增用户"}
            </h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* 表单 */}
          <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4" autoComplete="off">
            {/* 用户名 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                用户名 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.email}
                onChange={(e) => handleChange("email", e.target.value)}
                className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.email ? "border-red-500" : "border-gray-300"
                }`}
                placeholder="请输入用户名（至少4个字符）"
                autoComplete="off"
              />
              {errors.email && (
                <p className="mt-1 text-sm text-red-500">{errors.email}</p>
              )}
            </div>

            {/* 密码 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                密码 {!user && <span className="text-red-500">*</span>}
              </label>
              <input
                type="password"
                value={formData.password}
                onChange={(e) => handleChange("password", e.target.value)}
                className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.password ? "border-red-500" : "border-gray-300"
                }`}
                placeholder={user ? "留空表示不修改密码" : "请输入密码（至少6位）"}
                autoComplete="new-password"
              />
              {errors.password && (
                <p className="mt-1 text-sm text-red-500">{errors.password}</p>
              )}
            </div>

            {/* 公司名称 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                公司名称
              </label>
              <input
                type="text"
                value={formData.companyName}
                onChange={(e) => handleChange("companyName", e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="请输入公司名称（可选）"
              />
            </div>

            {/* 角色 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                角色 <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.role}
                onChange={(e) => handleChange("role", e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="user">用户</option>
                <option value="admin">管理员</option>
              </select>
            </div>

            {/* 初始积分（仅新增时显示） */}
            {!user && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  初始积分
                </label>
                <input
                  type="number"
                  value={formData.initialCredits ?? 1500}
                  onChange={(e) => handleChange("initialCredits", e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="请输入初始积分，默认 1500"
                  min="0"
                />
                <p className="mt-1 text-xs text-gray-500">新增用户时的初始积分，默认 1500</p>
              </div>
            )}

            {/* 按钮 */}
            <div className="flex justify-end gap-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                disabled={isLoading}
              >
                取消
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={isLoading}
              >
                {isLoading ? "保存中..." : "保存"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
