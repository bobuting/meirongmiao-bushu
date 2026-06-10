/**
 * 积分调整弹窗
 *
 * 支持增加/减少积分，并填写调整原因
 */

import React, { useState } from "react";
import { Button } from "../../components/ui/Button";

interface CreditAdjustModalProps {
  open: boolean;
  userId: string;
  userEmail: string;
  currentBalance: number;
  onClose: () => void;
  onSubmit: (delta: number, reason: string) => Promise<void>;
}

export const CreditAdjustModal: React.FC<CreditAdjustModalProps> = ({
  open,
  userId,
  userEmail,
  currentBalance,
  onClose,
  onSubmit,
}) => {
  const [delta, setDelta] = useState<string>("0");
  const [reason, setReason] = useState<string>("manual");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const deltaNum = parseInt(delta, 10) || 0;
  const newBalance = currentBalance + deltaNum;

  const handleSubmit = async () => {
    if (deltaNum === 0) {
      setError("调整金额不能为 0");
      return;
    }
    if (newBalance < 0) {
      setError("调整后积分不能为负数，当前余额不足");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await onSubmit(deltaNum, reason.trim() || "manual");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "调整失败");
    } finally {
      setLoading(false);
    }
  };

  // 禁用提交按钮：加载中、金额为0、调整后为负数
  const submitDisabled = loading || deltaNum === 0 || newBalance < 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-[400px] rounded-xl bg-white p-6 shadow-xl">
        <h2 className="text-lg font-bold text-gray-900">积分调整</h2>
        <p className="mt-1 text-sm text-gray-500">
          用户：{userEmail}
        </p>

        <div className="mt-4 space-y-4">
          {/* 当前积分 */}
          <div>
            <label className="block text-sm font-medium text-gray-700">当前积分</label>
            <div className="mt-1 text-lg font-mono text-gray-900">{currentBalance}</div>
          </div>

          {/* 调整金额 */}
          <div>
            <label className="block text-sm font-medium text-gray-700">调整金额（正数为增加，负数为减少）</label>
            <input
              type="number"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
              value={delta}
              onChange={(e) => setDelta(e.target.value)}
              placeholder="输入调整金额，如 100 或 -50"
            />
          </div>

          {/* 调整后积分 */}
          <div>
            <label className="block text-sm font-medium text-gray-700">调整后积分</label>
            <div className={`mt-1 text-lg font-mono ${newBalance < 0 ? "text-red-600" : "text-gray-900"}`}>
              {newBalance}
            </div>
          </div>

          {/* 调整原因 */}
          <div>
            <label className="block text-sm font-medium text-gray-700">调整原因</label>
            <input
              type="text"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="填写调整原因"
            />
          </div>
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
            {error}
          </div>
        )}

        {/* 操作按钮 */}
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            取消
          </Button>
          <Button onClick={handleSubmit} isLoading={loading} disabled={submitDisabled}>
            确认调整
          </Button>
        </div>
      </div>
    </div>
  );
};