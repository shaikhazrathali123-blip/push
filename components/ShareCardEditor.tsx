"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface Stats {
  reps: number;
  bestSet: number;
  durationSec: number;
  xp: number;
  currentStreak: number;
  longestStreak: number;
  rank?: number;
}

type StickerStyle = "classic" | "bold" | "compact" | "minimal";

function formatDuration(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// Helper to draw text with a subtle dark stroke, ensuring readability on ANY background (Strava-style)
function drawStrokedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  font: string,
  fill: string,
  stroke: string,
  lineWidth: number
) {
  ctx.font = font;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lineWidth;
  ctx.lineJoin = "round";
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

function renderClassic(ctx: CanvasRenderingContext2D, stats: Stats, scale: number) {
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const cx = 300 * scale;
  const cy = 200 * scale;

  ctx.font = `700 ${24 * scale}px 'Space Grotesk', sans-serif`;
  const pushW = ctx.measureText("PUSH").width;
  const questW = ctx.measureText("QUEST").width;
  const totalW = pushW + 4 * scale + questW;

  drawStrokedText(ctx, "PUSH", cx - totalW / 2, cy - 120 * scale, `700 ${24 * scale}px 'Space Grotesk', sans-serif`, "#ff6b1a", "rgba(0,0,0,0.6)", 3 * scale);
  drawStrokedText(ctx, "QUEST", cx - totalW / 2 + pushW + 4 * scale, cy - 120 * scale, `700 ${24 * scale}px 'Space Grotesk', sans-serif`, "#f5f5f4", "rgba(0,0,0,0.6)", 3 * scale);

  drawStrokedText(ctx, String(stats.reps), cx, cy + 10 * scale, `800 ${120 * scale}px 'Space Grotesk', sans-serif`, "#ffffff", "rgba(0,0,0,0.6)", 6 * scale);
  drawStrokedText(ctx, "PUSH-UPS", cx, cy + 70 * scale, `600 ${18 * scale}px 'Inter', sans-serif`, "rgba(255,255,255,0.8)", "rgba(0,0,0,0.6)", 3 * scale);

  ctx.strokeStyle = "rgba(255,255,255,0.4)";
  ctx.lineWidth = 2 * scale;
  ctx.beginPath();
  ctx.moveTo(cx - 60 * scale, cy + 110 * scale);
  ctx.lineTo(cx + 60 * scale, cy + 110 * scale);
  ctx.stroke();

  drawStrokedText(ctx, `${formatDuration(stats.durationSec)}  •  ${stats.bestSet} BEST SET  •  🔥 ${stats.currentStreak}`, cx, cy + 150 * scale, `600 ${16 * scale}px 'Inter', sans-serif`, "#ffffff", "rgba(0,0,0,0.6)", 3 * scale);
}

function renderBold(ctx: CanvasRenderingContext2D, stats: Stats, scale: number) {
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  const x = 40 * scale;
  let y = 40 * scale;

  drawStrokedText(ctx, String(stats.reps), x, y, `900 ${140 * scale}px 'Space Grotesk', sans-serif`, "#ffffff", "rgba(0,0,0,0.6)", 6 * scale);
  
  y += 130 * scale;
  drawStrokedText(ctx, "PUSH-UPS COMPLETED", x, y, `700 ${32 * scale}px 'Inter', sans-serif`, "#ff6b1a", "rgba(0,0,0,0.6)", 4 * scale);

  y += 60 * scale;
  drawStrokedText(ctx, `Duration: ${formatDuration(stats.durationSec)}`, x, y, `600 ${20 * scale}px 'Inter', sans-serif`, "#ffffff", "rgba(0,0,0,0.6)", 3 * scale);
  y += 35 * scale;
  drawStrokedText(ctx, `Best Set: ${stats.bestSet}  •  XP: +${stats.xp}`, x, y, `600 ${20 * scale}px 'Inter', sans-serif`, "#ffffff", "rgba(0,0,0,0.6)", 3 * scale);
  y += 35 * scale;
  drawStrokedText(ctx, `Streak: ${stats.currentStreak} days 🔥`, x, y, `600 ${20 * scale}px 'Inter', sans-serif`, "#ffffff", "rgba(0,0,0,0.6)", 3 * scale);
}

function renderCompact(ctx: CanvasRenderingContext2D, stats: Stats, scale: number) {
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const cx = 200 * scale;
  const cy = 150 * scale;

  drawStrokedText(ctx, "PUSHQUEST", cx, cy - 60 * scale, `700 ${20 * scale}px 'Inter', sans-serif`, "#ff6b1a", "rgba(0,0,0,0.6)", 3 * scale);
  drawStrokedText(ctx, `${stats.reps}`, cx, cy + 10 * scale, `800 ${80 * scale}px 'Space Grotesk', sans-serif`, "#ffffff", "rgba(0,0,0,0.6)", 5 * scale);
  drawStrokedText(ctx, "reps", cx, cy + 60 * scale, `600 ${16 * scale}px 'Inter', sans-serif`, "rgba(255,255,255,0.8)", "rgba(0,0,0,0.6)", 3 * scale);
  drawStrokedText(ctx, `${formatDuration(stats.durationSec)}  •  🔥 ${stats.currentStreak}`, cx, cy + 100 * scale, `500 ${14 * scale}px 'Inter', sans-serif`, "rgba(255,255,255,0.7)", "rgba(0,0,0,0.6)", 3 * scale);
}

function renderMinimal(ctx: CanvasRenderingContext2D, stats: Stats, scale: number) {
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  const x = 30 * scale;
  let y = 30 * scale;

  drawStrokedText(ctx, "PUSHQUEST WORKOUT", x, y, `500 ${14 * scale}px 'Inter', sans-serif`, "rgba(255,255,255,0.7)", "rgba(0,0,0,0.6)", 3 * scale);
  y += 40 * scale;
  drawStrokedText(ctx, `${stats.reps}`, x, y, `800 ${90 * scale}px 'Space Grotesk', sans-serif`, "#ffffff", "rgba(0,0,0,0.6)", 5 * scale);
  y += 80 * scale;
  drawStrokedText(ctx, "PUSH-UPS", x, y, `600 ${18 * scale}px 'Inter', sans-serif`, "#ff6b1a", "rgba(0,0,0,0.6)", 3 * scale);
  y += 40 * scale;
  drawStrokedText(ctx, `${formatDuration(stats.durationSec)}  •  Best: ${stats.bestSet}  •  🔥 ${stats.currentStreak}`, x, y, `400 ${14 * scale}px 'Inter', sans-serif`, "rgba(255,255,255,0.8)", "rgba(0,0,0,0.6)", 3 * scale);
}

export default function ShareSticker({ stats, onClose }: { stats: Stats; onClose: () => void }) {
  const [selectedStyle, setSelectedStyle] = useState<StickerStyle>("classic");
  const [stickerUrl, setStickerUrl] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const generateSticker = useCallback(() => {
    const canvas = document.createElement("canvas");
    const scale = 3; // 3x for crisp exports
    let baseW = 600, baseH = 400;
    if (selectedStyle === "compact") { baseW = 400; baseH = 300; }
    
    canvas.width = baseW * scale;
    canvas.height = baseH * scale;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(scale, scale);
    
    // Fully transparent background (default canvas is transparent, but we clear to be sure)
    ctx.clearRect(0, 0, baseW, baseH);

    if (selectedStyle === "classic") renderClassic(ctx, stats, scale);
    else if (selectedStyle === "bold") renderBold(ctx, stats, scale);
    else if (selectedStyle === "compact") renderCompact(ctx, stats, scale);
    else if (selectedStyle === "minimal") renderMinimal(ctx, stats, scale);

    const dataUrl = canvas.toDataURL("image/png");
    setStickerUrl(dataUrl);
    canvasRef.current = canvas;
  }, [stats, selectedStyle]);

  useEffect(() => {
    generateSticker();
  }, [generateSticker]);

  const handleDownload = () => {
    if (!stickerUrl) return;
    const a = document.createElement("a");
    a.href = stickerUrl;
    a.download = `pushquest-${selectedStyle}-sticker.png`;
    a.click();
  };

  const handleCopy = async () => {
    if (!canvasRef.current) return;
    try {
      canvasRef.current.toBlob(async (blob) => {
        if (!blob) return;
        // @ts-ignore - ClipboardItem is supported in modern browsers
        await navigator.clipboard.write([
          new ClipboardItem({ "image/png": blob })
        ]);
        alert("Sticker copied to clipboard!");
      });
    } catch (err) {
      console.error("Failed to copy: ", err);
      alert("Failed to copy. Your browser may not support this. Try downloading instead.");
    }
  };

  const styles: { id: StickerStyle; label: string }[] = [
    { id: "classic", label: "Classic" },
    { id: "bold", label: "Bold" },
    { id: "compact", label: "Compact" },
    { id: "minimal", label: "Minimal" },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center p-4">
      <div className="bg-base-900 border border-base-700/60 rounded-2xl w-full max-w-md flex flex-col overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-base-700/60">
          <h2 className="font-display font-semibold text-lg">Share Sticker</h2>
          <button onClick={onClose} className="text-ink-400 hover:text-ink-200 text-sm">Close</button>
        </div>

        <div className="p-5 flex flex-col gap-4">
          {/* Preview Area with checkerboard pattern to explicitly show transparency */}
          <div className="relative w-full aspect-[3/2] rounded-xl overflow-hidden border border-base-700/40" 
               style={{ 
                 backgroundImage: "linear-gradient(45deg, #1a1a1a 25%, transparent 25%), linear-gradient(-45deg, #1a1a1a 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #1a1a1a 75%), linear-gradient(-45deg, transparent 75%, #1a1a1a 75%)",
                 backgroundSize: "20px 20px",
                 backgroundPosition: "0 0, 0 10px, 10px -10px, -10px 0px"
               }}>
            {stickerUrl && (
              <img 
                src={stickerUrl} 
                alt="Sticker Preview" 
                className="absolute inset-0 w-full h-full object-contain p-4" 
              />
            )}
          </div>

          {/* Style Selector */}
          <div className="grid grid-cols-4 gap-2">
            {styles.map((style) => (
              <button
                key={style.id}
                onClick={() => setSelectedStyle(style.id)}
                className={`py-2 px-1 text-xs font-medium rounded-lg border transition-colors ${
                  selectedStyle === style.id
                    ? "bg-volt-500/20 border-volt-500 text-volt-400"
                    : "bg-base-800 border-base-700 text-ink-400 hover:bg-base-700"
                }`}
              >
                {style.label}
              </button>
            ))}
          </div>

          <p className="text-ink-500 text-xs text-center">
            Fully transparent background. Ready to overlay on any photo or video.
          </p>

          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-3 mt-2">
            <button 
              onClick={handleCopy}
              className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-base-800 border border-base-700 text-ink-200 font-medium hover:bg-base-700 transition-colors"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
              Copy
            </button>
            <button 
              onClick={handleDownload}
              className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-volt-500 text-base-950 font-bold hover:bg-volt-400 transition-colors"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
              Save PNG
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}