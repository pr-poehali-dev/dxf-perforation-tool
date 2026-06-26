export interface PerfoSettings {
  spacing: number;     // шаг сетки, мм
  minHole: number;     // минимальный диаметр отверстия, мм
  maxHole: number;     // максимальный диаметр отверстия, мм
  sensitivity: number; // чувствительность 0..2 (гамма-коррекция)
  invert: boolean;     // светлое = большие отверстия или наоборот
  threshold: number;   // порог отсечения мелких отверстий, мм
}

export interface Hole {
  x: number; // мм
  y: number; // мм
  d: number; // диаметр, мм
}

export interface PerfoResult {
  holes: Hole[];
  widthMm: number;
  heightMm: number;
  cols: number;
  rows: number;
}

export const DEFAULT_SETTINGS: PerfoSettings = {
  spacing: 8,
  minHole: 1.5,
  maxHole: 6,
  sensitivity: 1,
  invert: false,
  threshold: 1,
};

// Реальная генерация перфорации по яркости пикселей изображения.
export function generatePerforation(
  img: HTMLImageElement,
  s: PerfoSettings,
  boardWidthMm = 600
): PerfoResult {
  const aspect = img.height / img.width;
  const boardHeightMm = boardWidthMm * aspect;

  const cols = Math.max(2, Math.floor(boardWidthMm / s.spacing));
  const rows = Math.max(2, Math.floor(boardHeightMm / s.spacing));

  // Рендерим изображение в маленький canvas размером сетки
  const cv = document.createElement('canvas');
  cv.width = cols;
  cv.height = rows;
  const ctx = cv.getContext('2d')!;
  ctx.drawImage(img, 0, 0, cols, rows);
  const data = ctx.getImageData(0, 0, cols, rows).data;

  const holes: Hole[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = (r * cols + c) * 4;
      const lum = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255;
      let v = s.invert ? lum : 1 - lum;
      v = Math.pow(Math.min(1, Math.max(0, v)), 1 / s.sensitivity);
      const d = s.minHole + v * (s.maxHole - s.minHole);
      if (d < s.threshold) continue;
      holes.push({
        x: c * s.spacing + s.spacing / 2,
        y: r * s.spacing + s.spacing / 2,
        d: Math.round(d * 100) / 100,
      });
    }
  }

  return {
    holes,
    widthMm: Math.round(boardWidthMm),
    heightMm: Math.round(boardHeightMm),
    cols,
    rows,
  };
}

// Генерация настоящего DXF-файла (окружности).
export function toDXF(result: PerfoResult): string {
  const h = (g: number, v: string | number) => `${g}\n${v}\n`;
  let body = '';
  body += h(0, 'SECTION') + h(2, 'ENTITIES');
  for (const hole of result.holes) {
    body += h(0, 'CIRCLE');
    body += h(8, 'PERFORATION');
    body += h(10, hole.x.toFixed(3));
    body += h(20, (result.heightMm - hole.y).toFixed(3));
    body += h(30, '0.0');
    body += h(40, (hole.d / 2).toFixed(3));
  }
  body += h(0, 'ENDSEC') + h(0, 'EOF');
  return body;
}

// Генерация SVG для просмотра / экспорта.
export function toSVG(result: PerfoResult): string {
  const circles = result.holes
    .map((hole) => `<circle cx="${hole.x}" cy="${hole.y}" r="${(hole.d / 2).toFixed(2)}"/>`)
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${result.widthMm}mm" height="${result.heightMm}mm" viewBox="0 0 ${result.widthMm} ${result.heightMm}"><rect width="100%" height="100%" fill="none"/><g fill="black">${circles}</g></svg>`;
}

export function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
