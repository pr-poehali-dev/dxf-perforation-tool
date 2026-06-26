import { useCallback, useEffect, useRef, useState } from 'react';
import Icon from '@/components/ui/icon';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import {
  DEFAULT_SETTINGS,
  PerfoSettings,
  PerfoResult,
  generatePerforation,
  toDXF,
  toSVG,
  download,
} from '@/lib/perfo';

const Index = () => {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [settings, setSettings] = useState<PerfoSettings>(DEFAULT_SETTINGS);
  const [boardWidth, setBoardWidth] = useState(600);
  const [result, setResult] = useState<PerfoResult | null>(null);
  const [zoom, setZoom] = useState(1);

  const [history, setHistory] = useState<PerfoSettings[]>([DEFAULT_SETTINGS]);
  const [hIndex, setHIndex] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const pushHistory = (next: PerfoSettings) => {
    const trimmed = history.slice(0, hIndex + 1);
    const upd = [...trimmed, next];
    setHistory(upd);
    setHIndex(upd.length - 1);
  };

  const update = (patch: Partial<PerfoSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    pushHistory(next);
  };

  const undo = () => {
    if (hIndex > 0) {
      const i = hIndex - 1;
      setHIndex(i);
      setSettings(history[i]);
    }
  };
  const redo = () => {
    if (hIndex < history.length - 1) {
      const i = hIndex + 1;
      setHIndex(i);
      setSettings(history[i]);
    }
  };

  const onFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const image = new Image();
      image.onload = () => {
        setImg(image);
        setImgSrc(e.target?.result as string);
        toast.success('Изображение загружено');
      };
      image.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  // Пересчёт перфорации
  useEffect(() => {
    if (!img) return;
    const res = generatePerforation(img, settings, boardWidth);
    setResult(res);
  }, [img, settings, boardWidth]);

  // Отрисовка
  const draw = useCallback(() => {
    const cv = canvasRef.current;
    if (!cv || !result) return;
    const ctx = cv.getContext('2d')!;
    const scale = (2 * zoom);
    cv.width = result.widthMm * scale;
    cv.height = result.heightMm * scale;

    ctx.fillStyle = '#0a0f17';
    ctx.fillRect(0, 0, cv.width, cv.height);

    // сетка
    ctx.strokeStyle = 'rgba(45,212,191,0.08)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= result.widthMm; x += settings.spacing) {
      ctx.beginPath();
      ctx.moveTo(x * scale, 0);
      ctx.lineTo(x * scale, cv.height);
      ctx.stroke();
    }
    for (let y = 0; y <= result.heightMm; y += settings.spacing) {
      ctx.beginPath();
      ctx.moveTo(0, y * scale);
      ctx.lineTo(cv.width, y * scale);
      ctx.stroke();
    }

    // отверстия
    ctx.fillStyle = '#2dd4bf';
    for (const h of result.holes) {
      ctx.beginPath();
      ctx.arc(h.x * scale, h.y * scale, (h.d / 2) * scale, 0, Math.PI * 2);
      ctx.fill();
    }

    // рамка листа
    ctx.strokeStyle = 'rgba(249,158,55,0.6)';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, cv.width, cv.height);
  }, [result, zoom, settings.spacing]);

  useEffect(() => {
    draw();
  }, [draw]);

  const exportDXF = () => {
    if (!result) return;
    download('perforation.dxf', toDXF(result), 'application/dxf');
    toast.success(`Экспортировано ${result.holes.length} отверстий в DXF`);
  };
  const exportSVG = () => {
    if (!result) return;
    download('perforation.svg', toSVG(result), 'image/svg+xml');
    toast.success('Экспортировано в SVG');
  };

  return (
    <div className="min-h-screen text-foreground">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/15 border border-primary/40 flex items-center justify-center animate-glow">
            <Icon name="Grid3x3" className="text-primary" size={20} />
          </div>
          <div>
            <h1 className="font-bold text-lg leading-none tracking-tight">
              Perfo<span className="text-primary">Studio</span>
            </h1>
            <p className="text-[11px] text-muted-foreground font-mono">image → vector DXF</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={undo} disabled={hIndex === 0} title="Отменить">
            <Icon name="Undo2" size={18} />
          </Button>
          <Button variant="ghost" size="icon" onClick={redo} disabled={hIndex === history.length - 1} title="Повторить">
            <Icon name="Redo2" size={18} />
          </Button>
          <div className="w-px h-6 bg-border mx-1" />
          <Button onClick={exportSVG} variant="secondary" disabled={!result} className="gap-2">
            <Icon name="FileImage" size={16} /> SVG
          </Button>
          <Button onClick={exportDXF} disabled={!result} className="gap-2 font-semibold">
            <Icon name="Download" size={16} /> Экспорт DXF
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr]">
        {/* Sidebar */}
        <aside className="border-r border-border bg-card/40 p-5 space-y-6 max-h-[calc(100vh-61px)] overflow-y-auto">
          {/* Загрузка */}
          <section className="animate-fade-in">
            <SectionTitle icon="ImageUp" text="Изображение" />
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
            />
            <div
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files?.[0];
                if (f) onFile(f);
              }}
              className="group cursor-pointer rounded-xl border-2 border-dashed border-border hover:border-primary/60 transition-colors p-4 text-center"
            >
              {imgSrc ? (
                <img src={imgSrc} alt="preview" className="w-full h-32 object-contain rounded-md" />
              ) : (
                <div className="py-6 text-muted-foreground group-hover:text-primary transition-colors">
                  <Icon name="ImagePlus" size={28} className="mx-auto mb-2" />
                  <p className="text-sm">Перетащите файл или нажмите</p>
                  <p className="text-[11px] font-mono mt-1">PNG · JPG · BMP</p>
                </div>
              )}
            </div>
          </section>

          {/* Размер листа */}
          <section>
            <SectionTitle icon="Ruler" text="Размер листа" />
            <Field label="Ширина листа, мм">
              <Input
                type="number"
                value={boardWidth}
                onChange={(e) => setBoardWidth(Math.max(50, Number(e.target.value)))}
                className="font-mono"
              />
            </Field>
          </section>

          {/* Параметры */}
          <section>
            <SectionTitle icon="SlidersHorizontal" text="Параметры перфорации" />
            <SliderRow
              label="Шаг сетки"
              value={settings.spacing}
              min={3}
              max={25}
              step={0.5}
              unit="мм"
              onChange={(v) => update({ spacing: v })}
            />
            <SliderRow
              label="Мин. отверстие"
              value={settings.minHole}
              min={0.5}
              max={settings.maxHole - 0.5}
              step={0.1}
              unit="мм"
              onChange={(v) => update({ minHole: v })}
            />
            <SliderRow
              label="Макс. отверстие"
              value={settings.maxHole}
              min={settings.minHole + 0.5}
              max={20}
              step={0.1}
              unit="мм"
              onChange={(v) => update({ maxHole: v })}
            />
            <SliderRow
              label="Чувствительность"
              value={settings.sensitivity}
              min={0.3}
              max={2.5}
              step={0.05}
              unit="γ"
              onChange={(v) => update({ sensitivity: v })}
            />
            <SliderRow
              label="Порог отсечения"
              value={settings.threshold}
              min={0}
              max={settings.maxHole}
              step={0.1}
              unit="мм"
              onChange={(v) => update({ threshold: v })}
            />
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-muted-foreground">Инверсия яркости</span>
              <Switch checked={settings.invert} onCheckedChange={(v) => update({ invert: v })} />
            </div>
          </section>
        </aside>

        {/* Canvas area */}
        <main className="perfo-canvas relative flex flex-col">
          {/* Toolbar */}
          <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-card/30 backdrop-blur-sm">
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" onClick={() => setZoom((z) => Math.max(0.25, z - 0.25))}>
                <Icon name="ZoomOut" size={18} />
              </Button>
              <span className="font-mono text-sm w-14 text-center">{Math.round(zoom * 100)}%</span>
              <Button variant="ghost" size="icon" onClick={() => setZoom((z) => Math.min(4, z + 0.25))}>
                <Icon name="ZoomIn" size={18} />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => setZoom(1)} title="Сбросить">
                <Icon name="Maximize" size={18} />
              </Button>
            </div>
            {result && (
              <div className="flex items-center gap-4 font-mono text-xs text-muted-foreground">
                <Stat icon="Grid3x3" value={`${result.cols}×${result.rows}`} />
                <Stat icon="Circle" value={`${result.holes.length} отв.`} />
                <Stat icon="Ruler" value={`${result.widthMm}×${result.heightMm} мм`} />
              </div>
            )}
          </div>

          {/* Canvas */}
          <div className="flex-1 overflow-auto p-8 flex items-center justify-center">
            {result ? (
              <canvas
                ref={canvasRef}
                className="rounded-lg shadow-2xl shadow-primary/10 animate-scale-in max-w-none"
                style={{ imageRendering: 'auto' }}
              />
            ) : (
              <div className="text-center text-muted-foreground animate-fade-in">
                <Icon name="ScanLine" size={56} className="mx-auto mb-4 text-primary/40" />
                <p className="text-lg font-medium">Загрузите изображение</p>
                <p className="text-sm mt-1">и перфорация сгенерируется автоматически</p>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
};

const SectionTitle = ({ icon, text }: { icon: string; text: string }) => (
  <div className="flex items-center gap-2 mb-3">
    <Icon name={icon} size={15} className="text-primary" />
    <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{text}</h2>
  </div>
);

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="space-y-1.5">
    <label className="text-sm text-muted-foreground">{label}</label>
    {children}
  </div>
);

const SliderRow = ({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (v: number) => void;
}) => (
  <div className="py-2">
    <div className="flex items-center justify-between mb-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="font-mono text-sm text-primary font-semibold">
        {value} <span className="text-muted-foreground text-xs">{unit}</span>
      </span>
    </div>
    <Slider value={[value]} min={min} max={max} step={step} onValueChange={([v]) => onChange(v)} />
  </div>
);

const Stat = ({ icon, value }: { icon: string; value: string }) => (
  <span className="flex items-center gap-1.5">
    <Icon name={icon} size={13} className="text-primary/70" />
    {value}
  </span>
);

export default Index;
