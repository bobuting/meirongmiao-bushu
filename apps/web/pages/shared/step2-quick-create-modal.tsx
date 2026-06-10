// apps/web/pages/shared/step2-quick-create-modal.tsx
/**
 * Step2 角色快速上传模态框组件
 */

import React, { useState, useRef } from "react";
import { Button } from "../../components/ui/Button";

// ============================================================================
// QuickCreateCharacterModal 快速上传角色模态框
// ============================================================================

export const QuickCreateCharacterModal: React.FC<{
  isOpen: boolean;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (input: { name: string; tags: string[]; file: File }) => Promise<void>;
}> = ({ isOpen, isSubmitting, onClose, onSubmit }) => {
  const [name, setName] = useState("");
  const [tags, setTags] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string>("");
  const previewUrlRef = useRef<string>("");

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h3 className="text-lg font-bold text-gray-900 font-display">快速上传角色</h3>
          <button onClick={onClose} className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
            <span className="material-icons-round">close</span>
          </button>
        </div>
        <div className="space-y-4 p-5">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">角色名称</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white p-2.5 text-sm outline-none focus:border-primary"
              placeholder="例如：通勤模特-A"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">标签（逗号分隔）</span>
            <input
              value={tags}
              onChange={(event) => setTags(event.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white p-2.5 text-sm outline-none focus:border-primary"
              placeholder="真实感, 电商, 亚洲"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">上传正面图</span>
            <input
              type="file"
              accept="image/*"
              onChange={(event) => {
                const picked = event.target.files?.[0] ?? null;
                setFile(picked);
                if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
                const url = picked ? URL.createObjectURL(picked) : "";
                previewUrlRef.current = url;
                setPreview(url);
              }}
              className="w-full rounded-lg border border-gray-200 bg-white p-2 text-sm outline-none focus:border-primary"
            />
          </label>
          {preview ? (
            <div className="rounded-xl border border-gray-100 bg-gray-50 p-2">
              <img src={preview} alt="角色预览" className="mx-auto max-h-56 rounded-lg object-contain"  loading="lazy" />
            </div>
          ) : null}
        </div>
        <div className="flex justify-end gap-3 border-t border-gray-100 px-5 py-4">
          <Button variant="secondary" onClick={onClose}>
            取消
          </Button>
          <Button
            onClick={() =>
              void onSubmit({
                name: name.trim(),
                tags: tags
                  .split(/[,，]/)
                  .map((item) => item.trim())
                  .filter(Boolean),
                file: file as File,
              })
            }
            disabled={isSubmitting || !name.trim() || !file}
            isLoading={isSubmitting}
          >
            上传并加入角色库
          </Button>
        </div>
      </div>
    </div>
  );
};