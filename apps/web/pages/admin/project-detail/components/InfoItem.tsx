/**
 * 信息项组件
 */

import React, { useState } from 'react';
import { useToast } from '../../../../components/ui/Toast';

interface InfoItemProps {
  label: string;
  value: string;
  copyable?: boolean;
}

export const InfoItem: React.FC<InfoItemProps> = ({ label, value, copyable }) => {
  const toast = useToast();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!copyable) return;

    try {
      await navigator.clipboard.writeText(value);
      toast.success('复制成功');
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // fallback
      const textarea = document.createElement('textarea');
      textarea.value = value;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      toast.success('复制成功');
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <div>
      <div className="text-xs text-gray-400">{label}</div>
      <div
        className={`font-medium truncate text-sm ${copyable ? 'cursor-pointer select-none' : ''} ${
          copied ? 'text-green-600' : copyable ? 'text-gray-900 hover:text-primary' : 'text-gray-900'
        }`}
        title={copyable ? `${value} (点击复制)` : value}
        onClick={copyable ? handleCopy : undefined}
      >
        {value}
      </div>
    </div>
  );
};
