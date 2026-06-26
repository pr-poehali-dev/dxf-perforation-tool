export type HoleShape = 'circle' | 'square' | 'hexagon';

export interface PerfoSettings {
  spacing: number;     // шаг сетки, мм
  minHole: number;     // минимальный диаметр отверстия, мм
  maxHole: number;     // максимальный диаметр отверстия, мм
  sensitivity: number; // чувствительность 0..2 (гамма-коррекция)
  invert: boolean;     // светлое = большие отверстия или наоборот
  threshold: number;   // порог отсечения мелких отверстий, мм
  shape: HoleShape;    // форма отверстия
  stagger: boolean;    // шахматное расположение
}

export interface Hole {
  x: number; // мм
  y: number; // мм
  d: number; // диаметр (описанной окружности), мм
}

export interface PerfoResult {
  holes: Hole[];
  widthMm: number;
  heightMm: number;
  cols: number;
  rows: number;
  shape: HoleShape;
}

export const DEFAULT_SETTINGS: PerfoSettings = {
  spacing: 8,
  minHole: 1.5,
  maxHole: 6,
  sensitivity: 1,
  invert: false,
  threshold: 1,
  shape: 'circle',
  stagger: false,
};

// Вершины многоугольника отверстия в мм-координатах (центр cx,cy; d — диаметр описанной окружности)
export function shapeVertices(shape: HoleShape, cx: number, cy: number, d: number): [number, number][] {
  const r = d / 2;
  if (shape === 'square') {
    const s = r * 0.886; // приравниваем площадь к кругу примерно
    return [
      [cx - s, cy - s],
      [cx + s, cy - s],
      [cx + s, cy + s],
      [cx - s, cy + s],
    ];
  }
  // hexagon (плоской стороной вверх)
  const pts: [number, number][] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i + 30);
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return pts;
}

// Реальная генерация перфорации по яркости пикселей изображения.
export function generatePerforation(
  img: HTMLImageElement,
  s: PerfoSettings,
  boardWidthMm = 600,
  boardHeightMm = 400
): PerfoResult {

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
    const offset = s.stagger && r % 2 === 1 ? s.spacing / 2 : 0;
    for (let c = 0; c < cols; c++) {
      const i = (r * cols + c) * 4;
      const lum = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255;
      let v = s.invert ? lum : 1 - lum;
      v = Math.pow(Math.min(1, Math.max(0, v)), 1 / s.sensitivity);
      const d = s.minHole + v * (s.maxHole - s.minHole);
      if (d < s.threshold) continue;
      const x = c * s.spacing + s.spacing / 2 + offset;
      if (x > boardWidthMm) continue;
      holes.push({
        x,
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
    shape: s.shape,
  };
}

// Генерация настоящего DXF-файла.
export function toDXF(result: PerfoResult): string {
  const h = (g: number, v: string | number) => `${g}\n${v}\n`;
  let body = '';
  body += h(0, 'SECTION') + h(2, 'ENTITIES');
  for (const hole of result.holes) {
    if (result.shape === 'circle') {
      body += h(0, 'CIRCLE');
      body += h(8, 'PERFORATION');
      body += h(10, hole.x.toFixed(3));
      body += h(20, (result.heightMm - hole.y).toFixed(3));
      body += h(30, '0.0');
      body += h(40, (hole.d / 2).toFixed(3));
    } else {
      const verts = shapeVertices(result.shape, hole.x, result.heightMm - hole.y, hole.d);
      body += h(0, 'LWPOLYLINE');
      body += h(8, 'PERFORATION');
      body += h(90, verts.length);
      body += h(70, 1); // замкнутая
      for (const [vx, vy] of verts) {
        body += h(10, vx.toFixed(3));
        body += h(20, vy.toFixed(3));
      }
    }
  }
  body += h(0, 'ENDSEC') + h(0, 'EOF');
  return body;
}

// Генерация SVG для просмотра / экспорта.
export function toSVG(result: PerfoResult): string {
  const shapes = result.holes
    .map((hole) => {
      if (result.shape === 'circle') {
        return `<circle cx="${hole.x}" cy="${hole.y}" r="${(hole.d / 2).toFixed(2)}"/>`;
      }
      const pts = shapeVertices(result.shape, hole.x, hole.y, hole.d)
        .map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`)
        .join(' ');
      return `<polygon points="${pts}"/>`;
    })
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${result.widthMm}mm" height="${result.heightMm}mm" viewBox="0 0 ${result.widthMm} ${result.heightMm}"><rect width="100%" height="100%" fill="none"/><g fill="black">${shapes}</g></svg>`;
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