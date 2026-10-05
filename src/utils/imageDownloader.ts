import type { GridDownloadOptions } from '../types/downloadTypes';
import type { MappedPixel, PaletteColor } from './pixelation';
import type { ColorSystem } from './colorSystemUtils';
import { api } from '@/lib/client-api';

export function importCsvData(file: File): Promise<{
  mappedPixelData: MappedPixel[][];
  gridDimensions: { N: number; M: number };
}> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        if (!text) {
          reject(new Error('无法读取文件内容'));
          return;
        }
        
        // 解析CSV内容
        const lines = text.trim().split('\n');
        const M = lines.length; // 行数
        
        if (M === 0) {
          reject(new Error('CSV文件为空'));
          return;
        }
        
        // 解析第一行获取列数
        const firstRowData = lines[0].split(',');
        const N = firstRowData.length; // 列数
        
        if (N === 0) {
          reject(new Error('CSV文件格式无效'));
          return;
        }
        
        // 创建映射数据
        const mappedPixelData: MappedPixel[][] = [];
        
        for (let row = 0; row < M; row++) {
          const rowData = lines[row].split(',');
          const mappedRow: MappedPixel[] = [];
          
          // 确保每行都有正确的列数
          if (rowData.length !== N) {
            reject(new Error(`第${row + 1}行的列数不匹配，期望${N}列，实际${rowData.length}列`));
            return;
          }
          
          for (let col = 0; col < N; col++) {
            const cellValue = rowData[col].trim();
            
            if (cellValue === 'TRANSPARENT' || cellValue === '') {
              // 外部/透明单元格
              mappedRow.push({
                key: 'TRANSPARENT',
                color: '#FFFFFF',
                isExternal: true
              });
            } else {
              // 验证hex颜色格式
              const hexPattern = /^#[0-9A-Fa-f]{6}$/;
              if (!hexPattern.test(cellValue)) {
                reject(new Error(`第${row + 1}行第${col + 1}列的颜色值无效：${cellValue}`));
                return;
              }
              
              // 内部单元格
              mappedRow.push({
                key: cellValue.toUpperCase(),
                color: cellValue.toUpperCase(),
                isExternal: false
              });
            }
          }
          
          mappedPixelData.push(mappedRow);
        }
        
        // 返回解析结果
        resolve({
          mappedPixelData,
          gridDimensions: { N, M }
        });
        
      } catch (error) {
        reject(new Error(`解析CSV文件失败：${error}`));
      }
    };
    
    reader.onerror = () => {
      reject(new Error('读取文件失败'));
    };
    
    reader.readAsText(file, 'utf-8');
  });
}


let exporting = false;
export async function downloadImage(input: {
  mappedPixelData: MappedPixel[][] | null;
  gridDimensions: { N: number; M: number } | null;
  selectedColorSystem: ColorSystem;
  options: GridDownloadOptions;
  colorCounts?: { [key: string]: { count: number; color: string } } | null;
  totalBeadCount?: number;
  activeBeadPalette?: PaletteColor[];
}): Promise<boolean> {
  if (exporting) return false;
  if (!input.mappedPixelData || !input.gridDimensions) { alert('请先生成图纸'); return false; }
  exporting = true;
  try {
    const data = await api('/api/exports', {
      mappedPixelData: input.mappedPixelData,
      gridDimensions: input.gridDimensions,
      selectedColorSystem: input.selectedColorSystem,
      options: input.options,
    });
    showDownloads(data.files, data.cached);
    return true;
  } catch (error) {
    alert(error instanceof Error ? error.message : '导出失败，请稍后重试');
    return false;
  } finally { exporting = false; }
}
function showDownloads(files: { name: string; url: string }[], cached: boolean) {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:1000;background:#0008;display:flex;align-items:center;justify-content:center;padding:20px';
  const panel = document.createElement('div');
  panel.style.cssText = 'background:#181818;color:#ececec;padding:28px;border-radius:16px;max-width:420px;width:100%';
  panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); panel.setAttribute('aria-label', '导出完成');
  const title = document.createElement('p'); title.textContent = cached ? '图纸已生成，可直接下载。' : '导出成功，请下载图纸与采购清单。'; panel.appendChild(title);
  for (const file of files) { const a = document.createElement('a'); a.href = file.url; a.textContent = '下载 ' + file.name; a.style.cssText = 'display:block;color:#dedede;margin:16px 0'; panel.appendChild(a); }
  const note = document.createElement('p'); note.textContent = '链接最多有效 5 分钟，会员到期时失效。有效期内可在个人中心重新下载。'; note.style.fontSize = '12px'; panel.appendChild(note);
  const close = document.createElement('button'); close.textContent = '关闭'; close.style.cssText = 'padding:10px 16px;margin-top:16px;border:1px solid #525252;border-radius:8px';
  const dismiss = () => { document.removeEventListener('keydown', escape); overlay.remove(); };
  const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') dismiss(); };
  close.onclick = dismiss; panel.appendChild(close); overlay.appendChild(panel); document.body.appendChild(overlay); close.focus(); document.addEventListener('keydown', escape);
}
export async function exportCsvData(input: {
  mappedPixelData: MappedPixel[][] | null;
  gridDimensions: { N: number; M: number } | null;
  selectedColorSystem: ColorSystem;
}): Promise<boolean> {
  return downloadImage({ ...input, options: { showGrid: true, gridInterval: 10, showCoordinates: true, showCellNumbers: true, gridLineColor: '#555555', includeStats: true, exportCsv: true } });
}
