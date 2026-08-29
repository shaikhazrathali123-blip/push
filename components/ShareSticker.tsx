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

type StickerStyle = "horizontal" | "vertical";

function formatDuration(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// Draws text with a subtle dark outline + shadow (Strava-style readability)
function drawStickerText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  font: string,
  fill: string
) {
  ctx.font = font;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Shadow for depth
  ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
  ctx.shadowBlur = 16;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 4;

  // Subtle dark stroke for readability on any background
  ctx.strokeStyle = "rgba(0, 0, 0, 0.6)";
  ctx.lineWidth = 3;
  ctx.lineJoin = "round";
  ctx.strokeText(text, x, y);

  // Main fill
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);

  // Reset shadow
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
}

function renderHorizontal(ctx: CanvasRenderingContext2D, stats: Stats) {
  const W = 1080;
  const H = 608;
  const cx = W / 2;

  // Brand
  drawStickerText(ctx, "PUSHQUEST", cx, 120, `700 26px 'Inter', sans-serif`, "#ff6b1a");

  // Hero number
  drawStickerText(ctx, String(stats.reps), cx, 240, `800 140px 'Space Grotesk', sans-serif`, "#ffffff");

  // Activity
  drawStickerText(ctx, "PUSH-UPS", cx, 340, `600 30px 'Inter', sans-serif`, "rgba(255,255,255,0.9)");

  // Divider
  ctx.strokeStyle = "rgba(255,255,255,0.25)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - 100, 390);
  ctx.lineTo(cx + 100, 390);
  ctx.stroke();

  // Stats row
  const leftX = cx - 220;
  const rightX = cx + 220;
  drawStickerText(ctx, "DURATION", leftX, 440, `600 22px 'Inter', sans-serif`, "rgba(255,255,255,0.6)");
  drawStickerText(ctx, "BEST SET", rightX, 440, `600 22px 'Inter', sans-serif`, "rgba(255,255,255,0.6)");

  drawStickerText(ctx, formatDuration(stats.durationSec), leftX, 500, `700 52px 'Space Grotesk', sans-serif`, "#ffffff");
  drawStickerText(ctx, `${stats.bestSet}`, rightX, 500, `700 52px 'Space Grotesk', sans-serif`, "#ffffff");
}

function renderVertical(ctx: CanvasRenderingContext2D, stats: Stats) {
  const W = 1080;
  const H = 1920;
  const cx = W / 2;

  // Brand
  drawStickerText(ctx, "PUSHQUEST", cx, 520, `700 34px 'Inter', sans-serif`, "#ff6b1a");

  // Hero number
  drawStickerText(ctx, String(stats.reps), cx, 700, `800 220px 'Space Grotesk', sans-serif`, "#ffffff");

  // Activity
  drawStickerText(ctx, "PUSH-UPS", cx, 860, `600 38px 'Inter', sans-serif`, "rgba(255,255,255,0.9)");

  // Divider
  ctx.strokeStyle = "rgba(255,255,255,0.25)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - 120, 940);
  ctx.lineTo(cx + 120, 940);
  ctx.stroke();

  // Stats row
  const leftX = cx - 260;
  const rightX = cx + 260;
  drawStickerText(ctx, "DURATION", leftX, 1020, `600 28px 'Inter', sans-serif`, "rgba(255,255,255,0.6)");
  drawStickerText(ctx, "BEST SET", rightX, 1020, `600 28px 'Inter', sans-serif`, "rgba(255,255,255,0.6)");

  drawStickerText(ctx, formatDuration(stats.durationSec), leftX, 1110, `700 68px 'Space Grotesk', sans-serif`, "#ffffff");
  drawStickerText(ctx, `${stats.bestSet}`, rightX, 1110, `700 68px 'Space Grotesk', sans-serif`, "#ffffff");
}

export default function ShareSticker({ stats, onClose }: { stats: Stats; onClose: () => void }) {
  const [selectedStyle, setSelectedStyle] = useState<StickerStyle>("vertical");
  const [stickerUrl, setStickerUrl] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [copied, setCopied] = useState(false);

  const generateSticker = useCallback(() => {
    const canvas = document.createElement("canvas");
    const scale = 2;

    let baseW = 1080, baseH = 608;
    if (selectedStyle === "vertical") { baseW = 1080; baseH = 1920; }

    canvas.width = baseW * scale;
    canvas.height = baseH * scale;
    const ctx = canvas.getContext("2d")!;

    ctx.scale(scale, scale);
    ctx.clearRect(0, 0, baseW, baseH); // 100% transparent - no background drawn

    if (selectedStyle === "horizontal") renderHorizontal(ctx, stats);
    else renderVertical(ctx, stats);

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
    a.download = `pushquest-${selectedStyle}.png`;
    a.click();
  };

  const handleCopy = async () => {
    if (!canvasRef.current) return;
    try {
      canvasRef.current.toBlob(async (blob) => {
        if (!blob) return;
        // @ts-ignore
        await navigator.clipboard.write([
          new (window as any).ClipboardItem({ "image/png": blob })
        ]);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    } catch (err) {
      alert("Copy failed. Try downloading instead.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-4">
      <div className="bg-neutral-900/90 border border-neutral-800 rounded-3xl w-full max-w-md flex flex-col overflow-hidden shadow-2xl backdrop-blur-xl">
        <div className="flex items-center justify-between px-6 py-5 border-b border-neutral-800">
          <h2 className="font-semibold text-lg text-white">Share Workout</h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-white text-sm transition-colors"></button>
        </div>

        <div className="p-6 flex flex-col gap-5">
          {/* Preview with a real photo background to show transparency */}
          <div className="relative w-full rounded-2xl overflow-hidden border border-neutral-800" 
               style={{ aspectRatio: selectedStyle === "horizontal" ? "16/9" : "9/16" }}>
            {/* Sample photo background to demonstrate transparency */}
            <div className="absolute inset-0 bg-gradient-to-br from-slate-700 via-slate-800 to-slate-900">
              <div className="absolute inset-0 opacity-30" style={{
                backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cpath d='M20 80 Q30 40 50 50 T80 20' stroke='white' stroke-width='0.5' fill='none'/%3E%3C/svg%3E\")",
                backgroundSize: "cover"
              }} />
            </div>
            
            {stickerUrl && (
              <img 
                src={stickerUrl} 
                alt="Transparent sticker" 
                className="absolute inset-0 w-full h-full object-contain p-4" 
              />
            )}
            
            {/* Transparency indicator */}
            <div className="absolute top-3 right-3 bg-black/60 backdrop-blur-sm rounded-full px-2.5 py-1 flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              <span className="text-[10px] text-white/80 font-medium">Transparent PNG</span>
            </div>
          </div>

          {/* Style Selector */}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setSelectedStyle("horizontal")}
              className={`py-3 px-4 text-sm font-medium rounded-xl border transition-all ${
                selectedStyle === "horizontal"
                  ? "bg-orange-500/15 border-orange-500 text-orange-400"
                  : "bg-neutral-800/50 border-neutral-700 text-neutral-400 hover:text-white"
              }`}
            >
              Horizontal
            </button>
            <button
              onClick={() => setSelectedStyle("vertical")}
              className={`py-3 px-4 text-sm font-medium rounded-xl border transition-all ${
                selectedStyle === "vertical"
                  ? "bg-orange-500/15 border-orange-500 text-orange-400"
                  : "bg-neutral-800/50 border-neutral-700 text-neutral-400 hover:text-white"
              }`}
            >
              Vertical (Story)
            </button>
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-3">
            <button 
              onClick={handleCopy}
              className="flex items-center justify-center gap-2 py-3.5 rounded-xl bg-neutral-800 border border-neutral-700 text-white font-medium hover:bg-neutral-700 transition-colors"
            >
              {copied ? "✓ Copied!" : "📋 Copy"}
            </button>
            <button 
              onClick={handleDownload}
              className="flex items-center justify-center gap-2 py-3.5 rounded-xl bg-orange-500 text-black font-bold hover:bg-orange-400 transition-colors"
            >
              ⬇ Save PNG
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}