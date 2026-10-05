import React, { useState } from 'react';

interface ColorInfo {
  color: string;
  name: string;
  total: number;
  completed: number;
}

interface ColorPanelProps {
  colors: ColorInfo[];
  currentColor: string;
  onColorSelect: (color: string) => void;
  onClose: () => void;
}

const ColorPanel: React.FC<ColorPanelProps> = ({
  colors,
  currentColor,
  onColorSelect,
  onClose
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'progress' | 'name' | 'total'>('progress');

  // 过滤和排序颜色
  const filteredAndSortedColors = colors
    .filter(color =>
      color.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      color.color.toLowerCase().includes(searchTerm.toLowerCase())
    )
    .sort((a, b) => {
      switch (sortBy) {
        case 'progress':
          const progressA = (a.completed / a.total) * 100;
          const progressB = (b.completed / b.total) * 100;
          return progressA - progressB; // 进度低的在前
        case 'name':
          return a.name.localeCompare(b.name);
        case 'total':
          return b.total - a.total; // 数量多的在前
        default:
          return 0;
      }
    });

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-end">
      <div className="w-full bg-neutral-900 rounded-t-2xl max-h-[80vh] flex flex-col">
        {/* 拖拽指示条 */}
        <div className="flex justify-center py-2">
          <div className="w-10 h-1 bg-neutral-700 rounded-full"></div>
        </div>

        {/* 搜索框 */}
        <div className="px-4 pb-3">
          <div className="relative">
            <input
              type="text"
              placeholder="搜索颜色..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-neutral-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-400"
            />
            <svg
              className="absolute left-3 top-2.5 h-5 w-5 text-neutral-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
        </div>

        {/* 排序选项 */}
        <div className="px-4 pb-3">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'progress' | 'name' | 'total')}
            className="w-full p-2 border border-neutral-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-400"
          >
            <option value="progress">按进度排序</option>
            <option value="name">按名称排序</option>
            <option value="total">按数量排序</option>
          </select>
        </div>

        {/* 颜色列表 */}
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {filteredAndSortedColors.map((colorInfo) => {
            const progressPercentage = Math.round((colorInfo.completed / colorInfo.total) * 100);
            const isSelected = colorInfo.color === currentColor;
            const isCompleted = progressPercentage === 100;

            return (
              <button
                key={colorInfo.color}
                onClick={() => onColorSelect(colorInfo.color)}
                className={`w-full p-3 mb-2 rounded-lg border-2 transition-all ${
                  isSelected
                    ? 'border-neutral-400 bg-neutral-900'
                    : 'border-neutral-700 bg-neutral-900 hover:border-neutral-700'
                } ${isCompleted ? 'opacity-60' : ''}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div
                      className="w-10 h-10 rounded-full border-2 border-neutral-700 flex-shrink-0"
                      style={{ backgroundColor: colorInfo.color }}
                    />
                    <div className="text-left">
                      <div className="text-sm font-medium text-neutral-100 font-mono">
                        {colorInfo.name}
                      </div>
                      <div className="text-xs text-neutral-400">
                        {colorInfo.completed}/{colorInfo.total} ({progressPercentage}%)
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    {isCompleted && (
                      <div className="text-neutral-400">
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      </div>
                    )}
                    {isSelected && (
                      <div className="text-neutral-400">
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                      </div>
                    )}
                  </div>
                </div>

                {/* 进度条 */}
                <div className="mt-2 w-full bg-neutral-800 rounded-full h-1.5">
                  <div
                    className={`h-1.5 rounded-full transition-all ${
                      isCompleted ? 'bg-neutral-700' : 'bg-neutral-700'
                    }`}
                    style={{ width: `${progressPercentage}%` }}
                  />
                </div>
              </button>
            );
          })}
        </div>

        {/* 关闭按钮 */}
        <div className="p-4 border-t border-neutral-700">
          <button
            onClick={onClose}
            className="w-full py-3 bg-neutral-700 text-white rounded-lg hover:bg-neutral-700 transition-colors"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
};

export default ColorPanel;