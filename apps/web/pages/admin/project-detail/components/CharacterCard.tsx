/**
 * 角色卡片组件
 */

import React from 'react';
import { getOssThumbnailUrl } from '../../../../utils/ossImage';

interface CharacterCardProps {
  char: {
    id: string;
    name: string;
    thumbnailUrl: string | null;
    isSelected: boolean;
  };
  onClick: () => void;
}

export const CharacterCard: React.FC<CharacterCardProps> = ({ char, onClick }) => {
  // 判断名称是否需要截断显示
  const needsTruncate = char.name && char.name.length > 12;

  return (
    <div
      onClick={onClick}
      className={`rounded-xl border-2 overflow-hidden transition-all cursor-pointer ${
        char.isSelected
          ? 'border-primary bg-primary/5 shadow-md'
          : 'border-gray-200 bg-white hover:border-gray-300'
      }`}
    >
      <div className="aspect-square bg-gray-100">
        {char.thumbnailUrl ? (
          <img
            src={getOssThumbnailUrl(char.thumbnailUrl, 200)}
            alt={char.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="material-icons-round text-4xl text-gray-300">person</span>
          </div>
        )}
      </div>
      <div className="p-2 overflow-hidden relative group">
        <div className="text-xs font-medium text-gray-800 truncate">
          {char.name || '未命名'}
        </div>
        {/* 鼠标悬停时显示完整名称 */}
        {needsTruncate && (
          <div className="absolute left-0 right-0 bottom-full mb-1 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 whitespace-nowrap">
            {char.name}
          </div>
        )}
        {char.isSelected && (
          <div className="text-xs text-primary mt-1">已选中</div>
        )}
      </div>
    </div>
  );
};