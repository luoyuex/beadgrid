import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { validateExport } from '../src/lib/membership/core.mjs';
import { renderFiles } from '../src/lib/membership/render.mjs';
const mapping = JSON.parse(await readFile(new URL('../src/app/colorSystemMapping.json', import.meta.url)));
const [a, b] = Object.keys(mapping);
const options = { showGrid: false, showCoordinates: false, showCellNumbers: false, includeStats: false, exportCsv: true, gridInterval: 10, gridLineColor: '#555555' };
const input = system => ({ gridDimensions: { N: 2, M: 2 }, mappedPixelData: [[{ key: 'wrong', color: a }, { key: 'wrong', color: b }], [{ key: 'wrong', color: a }, { key: 'ERASE', color: '#FFFFFF' }]], selectedColorSystem: system, options });
test('server renderer outputs real PNGs and lossless CSV for all brands', async () => {
  for (const system of ['MARD', 'COCO', '漫漫', '盼盼', '咪小窝']) {
    const files = renderFiles(validateExport(input(system), mapping));
    assert.deepEqual(files.map(file => file.name), ['pattern.png', 'shopping-list.png', 'pattern.csv']);
    assert.equal(files[2].body.toString(), `${a},${b}\n${a},TRANSPARENT`);
    const image = await loadImage(files[0].body); assert.equal(image.width, 600); assert.equal(image.height, 164);
    const canvas = createCanvas(image.width, image.height), ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
    const pixel = (x, y) => [...ctx.getImageData(x, y, 1, 1).data];
    const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).concat(255);
    assert.deepEqual(pixel(27, 107), rgb(a)); assert.deepEqual(pixel(57, 107), rgb(b)); assert.deepEqual(pixel(57, 137), [255, 255, 255, 255]);
    assert.equal((await loadImage(files[1].body)).height, 116);
  }
});
test('settings affect rendered dimensions and optional CSV; invalid font fails', () => {
  const request = input('MARD'); request.options = { ...options, showGrid: true, showCoordinates: true, showCellNumbers: true, includeStats: true, exportCsv: false };
  const files = renderFiles(validateExport(request, mapping)); assert.equal(files.length, 2);
  const original = process.env.EXPORT_FONT_PATH;
  try { process.env.EXPORT_FONT_PATH = 'missing-font-file.ttf'; assert.throws(() => renderFiles(validateExport(request, mapping))); }
  finally { if (original === undefined) delete process.env.EXPORT_FONT_PATH; else process.env.EXPORT_FONT_PATH = original; }
});
test('representative printable sample includes all existing brand codes', async () => {
  const colors = Object.keys(mapping).slice(0, 12);
  const request = {
    gridDimensions: { N: 12, M: 8 }, selectedColorSystem: 'MARD',
    mappedPixelData: Array.from({ length: 8 }, (_, y) => colors.map((color, x) => ({ key: 'ignored', color, isExternal: y > 4 && x > 7 }))),
    options: { ...options, showGrid: true, showCoordinates: true, showCellNumbers: true, includeStats: true },
  };
  const files = renderFiles(validateExport(request, mapping));
  const directory = new URL('../.cache/export-preview/', import.meta.url); await mkdir(directory, { recursive: true });
  for (const file of files) await writeFile(new URL(file.name, directory), file.body);
  assert.ok(files[0].body.length > 1000);
});
