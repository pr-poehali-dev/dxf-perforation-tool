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
// Алгоритм: нормализация гистограммы — реальный диапазон яркостей
// растягивается на весь диапазон min..max отверстий для максимальной чёткости.
export function generatePerforation(
  img: HTMLImageElement,
  s: PerfoSettings,
  boardWidthMm = 600,
  boardHeightMm = 400
): PerfoResult {

  const cols = Math.max(2, Math.floor(boardWidthMm / s.spacing));
  const rows = Math.max(2, Math.floor(boardHeightMm / s.spacing));

  // Рендерим изображение в canvas размером сетки
  const cv = document.createElement('canvas');
  cv.width = cols;
  cv.height = rows;
  const ctx = cv.getContext('2d')!;
  ctx.drawImage(img, 0, 0, cols, rows);
  const data = ctx.getImageData(0, 0, cols, rows).data;

  const total = cols * rows;

  // Шаг 1: собираем все значения яркости
  const lums = new Float32Array(total);
  for (let n = 0; n < total; n++) {
    const i = n * 4;
    lums[n] = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255;
  }

  // Шаг 2: гистограммное выравнивание (histogram equalization)
  // Строим CDF и нормализуем — каждый пиксель получает ранг в диапазоне [0..1]
  const sorted = Float32Array.from(lums).sort();
  const equalized = new Float32Array(total);
  for (let n = 0; n < total; n++) {
    // бинарный поиск позиции в отсортированном массиве = ранг
    let lo = 0, hi = total - 1;
    const val = lums[n];
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sorted[mid] < val) lo = mid + 1; else hi = mid;
    }
    equalized[n] = lo / (total - 1);
  }

  // Шаг 3: дополнительная гамма-коррекция поверх выравнивания
  const holes: Hole[] = [];
  for (let r = 0; r < rows; r++) {
    const offset = s.stagger && r % 2 === 1 ? s.spacing / 2 : 0;
    for (let c = 0; c < cols; c++) {
      const n = r * cols + c;
      let v = s.invert ? equalized[n] : 1 - equalized[n];
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

// Экспорт в PDF через печать браузера — реальный масштаб 1:1 в мм.
export function toPDF(result: PerfoResult): void {
  const svgContent = toSVG(result);
  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<title>PerfoStudio — ${result.widthMm}×${result.heightMm}мм</title>
<style>
  @page {
    size: ${result.widthMm}mm ${result.heightMm}mm;
    margin: 0;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body {
    width: ${result.widthMm}mm;
    height: ${result.heightMm}mm;
    background: white;
    overflow: hidden;
  }
  svg {
    display: block;
    width: ${result.widthMm}mm;
    height: ${result.heightMm}mm;
  }
  @media print {
    html, body { width: ${result.widthMm}mm; height: ${result.heightMm}mm; }
  }
</style>
</head>
<body>${svgContent}</body>
</html>`;

  const win = window.open('', '_blank', 'width=800,height=600');
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.onload = () => {
    setTimeout(() => {
      win.focus();
      win.print();
    }, 300);
  };
}

// Экспорт в CSV для ЧПУ-станков.
// Колонки: №, X (мм), Y (мм), Диаметр (мм), Радиус (мм), Форма
export function toCSV(result: PerfoResult): string {
  const lines: string[] = [
    `# PerfoStudio — координаты отверстий`,
    `# Лист: ${result.widthMm} x ${result.heightMm} мм | Отверстий: ${result.holes.length} | Форма: ${result.shape}`,
    `N;X_mm;Y_mm;Diameter_mm;Radius_mm;Shape`,
  ];
  result.holes.forEach((h, i) => {
    lines.push(`${i + 1};${h.x.toFixed(3)};${h.y.toFixed(3)};${h.d.toFixed(3)};${(h.d / 2).toFixed(3)};${result.shape}`);
  });
  return lines.join('\r\n');
}

// Настройки G-code
export interface GCodeSettings {
  feedRate: number;      // подача XY, мм/мин
  plungeRate: number;    // подача по Z (врезание), мм/мин
  safeZ: number;         // безопасная высота Z, мм
  cutDepth: number;      // глубина фрезерования, мм
  toolDiameter: number;  // диаметр инструмента, мм
  spindleSpeed: number;  // обороты шпинделя, RPM
}

export const DEFAULT_GCODE: GCodeSettings = {
  feedRate: 1000,
  plungeRate: 300,
  safeZ: 5,
  cutDepth: -3,
  toolDiameter: 3,
  spindleSpeed: 12000,
};

// G-code для фрезерного ЧПУ.
// Каждое отверстие: подход → врезание → круговая фреза (G2) → подъём.
export function toGCode(result: PerfoResult, g: GCodeSettings): string {
  const lines: string[] = [];
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

  // Заголовок
  lines.push(
    `; PerfoStudio — G-code export`,
    `; Date: ${now}`,
    `; Sheet: ${result.widthMm} x ${result.heightMm} mm`,
    `; Holes: ${result.holes.length} | Shape: ${result.shape}`,
    `; Tool diameter: ${g.toolDiameter} mm`,
    `; Cut depth: ${g.cutDepth} mm | Feed: ${g.feedRate} mm/min`,
    ``,
    `G21        ; мм`,
    `G90        ; абсолютные координаты`,
    `G17        ; плоскость XY`,
    `M3 S${g.spindleSpeed} ; шпиндель ВКЛ`,
    `G4 P2      ; пауза 2 сек`,
    `G0 Z${g.safeZ.toFixed(3)} ; безопасная высота`,
    ``,
  );

  result.holes.forEach((h, i) => {
    const r = Math.max(0.01, (h.d - g.toolDiameter) / 2); // радиус траектории
    const startX = (h.x + r).toFixed(3);
    const cy = h.y.toFixed(3);
    const cx = h.x.toFixed(3);

    lines.push(`; Отверстие #${i + 1}  D=${h.d}мм  X=${cx} Y=${cy}`);
    lines.push(`G0 X${startX} Y${cy}`);           // быстрый подход
    lines.push(`G1 Z${g.cutDepth.toFixed(3)} F${g.plungeRate} ; врезание`);
    if (r > 0.01) {
      lines.push(`G2 X${startX} Y${cy} I${(-r).toFixed(3)} J0.000 F${g.feedRate} ; круговая фреза`);
    }
    lines.push(`G0 Z${g.safeZ.toFixed(3)}`);      // подъём
    lines.push(``);
  });

  lines.push(
    `G0 Z${g.safeZ.toFixed(3)}`,
    `G0 X0 Y0   ; парковка`,
    `M5         ; шпиндель ВЫКЛ`,
    `M30        ; конец программы`,
  );

  return lines.join('\r\n');
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