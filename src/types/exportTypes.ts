import type { ColorSystem } from '@/utils/colorSystemUtils';
import type { GridDownloadOptions } from './downloadTypes';
export type ExportPayload = {
  width: number;
  height: number;
  system: ColorSystem;
  grid: (string | null)[][];
  options: GridDownloadOptions;
};
