import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import mapping from '../../app/colorSystemMapping.json' with { type: 'json' };
function key(hex, system) {
  return mapping[hex][system];
}
/** @param {import("../../types/exportTypes").ExportPayload} payload */
export function renderFiles(payload) {
  if (process.env.EXPORT_FONT_PATH && !GlobalFonts.registerFromPath(process.env.EXPORT_FONT_PATH, 'Perler')) throw new Error('导出字体加载失败');
  const font = ['Perler', 'Noto Sans CJK SC', 'Noto Sans SC', 'Microsoft YaHei', 'SimHei'].find(name => GlobalFonts.has(name));
  if (!font) throw new Error('请配置包含中文的 EXPORT_FONT_PATH');
  const { width, height, grid, system, options } = payload;
  const counts = new Map();
  for (const row of grid) for (const hex of row) if (hex) counts.set(hex, (counts.get(hex) || 0) + 1);
  const stats = [...counts].sort(([a], [b]) => key(a, system).localeCompare(key(b, system), 'zh-CN', { numeric: true }));
  const cell = 30, margin = options.showCoordinates ? 40 : 12;
  const canvasWidth = Math.max(600, width * cell + margin * 2);
  const columns = Math.max(1, Math.floor((canvasWidth - 40) / 220));
  const statsHeight = 80 + Math.ceil(stats.length / columns) * 36;
  const pattern = createCanvas(canvasWidth, 80 + height * cell + margin * 2 + (options.includeStats ? statsHeight : 0));
  const ctx = pattern.getContext('2d');
  ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, pattern.width, pattern.height);
  ctx.fillStyle = '#1F2937'; ctx.fillRect(0, 0, pattern.width, 60);
  ctx.fillStyle = '#FFFFFF'; ctx.font = `24px "${font}"`;
  ctx.fillText(`豆格 BeadGrid · ${system} · ${width} × ${height}`, 20, 40);
  const left = margin, top = 80 + margin;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const hex = grid[y][x];
    if (!hex) continue;
    ctx.fillStyle = hex; ctx.fillRect(left + x * cell, top + y * cell, cell, cell);
    if (options.showCellNumbers) {
      const rgb = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
      ctx.fillStyle = rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722 > 127 ? '#000000' : '#FFFFFF';
      ctx.font = `10px "${font}"`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(key(hex, system), left + x * cell + 15, top + y * cell + 15, 28);
    }
  }
  if (options.showGrid) {
    ctx.strokeStyle = options.gridLineColor;
    for (let x = 0; x <= width; x++) { ctx.lineWidth = x % options.gridInterval === 0 ? 2 : .5; ctx.beginPath(); ctx.moveTo(left + x * cell, top); ctx.lineTo(left + x * cell, top + height * cell); ctx.stroke(); }
    for (let y = 0; y <= height; y++) { ctx.lineWidth = y % options.gridInterval === 0 ? 2 : .5; ctx.beginPath(); ctx.moveTo(left, top + y * cell); ctx.lineTo(left + width * cell, top + y * cell); ctx.stroke(); }
  }
  if (options.showCoordinates) {
    ctx.fillStyle = '#374151'; ctx.font = `11px "${font}"`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let x = 0; x < width; x++) { ctx.fillText(String(x + 1), left + x * cell + 15, top - 18); ctx.fillText(String(x + 1), left + x * cell + 15, top + height * cell + 18); }
    for (let y = 0; y < height; y++) { ctx.fillText(String(y + 1), left - 18, top + y * cell + 15); ctx.fillText(String(y + 1), left + width * cell + 18, top + y * cell + 15); }
  }
  function drawStats(target, offset) {
    const c = target.getContext('2d'); c.textAlign = 'left'; c.textBaseline = 'alphabetic'; c.font = `20px "${font}"`; c.fillStyle = '#111827';
    c.fillText(`采购清单 · 共 ${[...counts.values()].reduce((a, b) => a + b, 0)} 颗`, 20, offset + 30);
    stats.forEach(([hex, count], i) => { const x = 20 + (i % columns) * 220, y = offset + 50 + Math.floor(i / columns) * 36; c.fillStyle = hex; c.fillRect(x, y, 24, 24); c.strokeStyle = '#9CA3AF'; c.lineWidth = 1; c.strokeRect(x, y, 24, 24); c.fillStyle = '#111827'; c.font = `16px "${font}"`; c.fillText(`${key(hex, system)} × ${count}`, x + 34, y + 18); });
  }
  if (options.includeStats) drawStats(pattern, top + height * cell + margin);
  const shopping = createCanvas(canvasWidth, statsHeight);
  const shoppingCtx = shopping.getContext('2d'); shoppingCtx.fillStyle = '#FFFFFF'; shoppingCtx.fillRect(0, 0, shopping.width, shopping.height); drawStats(shopping, 0);
  const files = [{ name: 'pattern.png', type: 'image/png', body: pattern.toBuffer('image/png') }, { name: 'shopping-list.png', type: 'image/png', body: shopping.toBuffer('image/png') }];
  if (options.exportCsv) files.push({ name: 'pattern.csv', type: 'text/csv', body: Buffer.from(grid.map(row => row.map(hex => hex || 'TRANSPARENT').join(',')).join('\n')) });
  return files;
}
