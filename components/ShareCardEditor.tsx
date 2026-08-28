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

/**
 * Renders the stat sticker to an offscreen canvas with a transparent
 * background (so it can be downloaded standalone or composited over a photo),
 * then converts it to a data URL used both as the downloadable sticker and as
 * the draggable overlay image in the editor.
 */
function renderStickerDataUrl(stats: Stats): string {
  const canvas = document.createElement("canvas");
  const scale = 3; // export at 3x for crisp downloads
  const W = 380 * scale;
  const H = 460 * scale;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(scale, scale);
  ctx.clearRect(0, 0, 380, 460);

  // Card background: translucent charcoal glass panel.
  roundRect(ctx, 0, 0, 380, 460, 28);
  const grad = ctx.createLinearGradient(0, 0, 0, 460);
  grad.addColorStop(0, "rgba(20,20,22,0.92)");
  grad.addColorStop(1, "rgba(10,10,11,0.96)");
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // volt glow accent top.
  const glow = ctx.createRadialGradient(190, 0, 10, 190, 0, 220);
  glow.addColorStop(0, "rgba(255,107,26,0.35)");
  glow.addColorStop(1, "rgba(255,107,26,0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(190, 0, 220, 0, Math.PI * 2);
  ctx.fill();

  // Wordmark
  ctx.fillStyle = "#f5f5f4";
  ctx.font = "700 22px 'Space Grotesk', sans-serif";
  ctx.fillText("Push", 28, 52);
  ctx.fillStyle = "#ff6b1a";
  const pushWidth = ctx.measureText("Push").width;
  ctx.fillText("Quest", 28 + pushWidth, 52);

  ctx.fillStyle = "rgba(139,139,143,1)";
  ctx.font = "500 12px 'Inter', sans-serif";
  ctx.fillText("CAMERA-VERIFIED WORKOUT", 28, 72);

  // Big rep count
  ctx.fillStyle = "#ff8a3d";
  ctx.font = "700 96px 'Space Grotesk', sans-serif";
  ctx.fillText(String(stats.reps), 28, 178);
  ctx.fillStyle = "rgba(199,199,201,1)";
  ctx.font = "500 15px 'Inter', sans-serif";
  ctx.fillText("PUSH-UPS", 30, 200);

  // Stat grid
  const statList: Array<[string, string]> = [
    ["BEST SET", `${stats.bestSet}`],
    ["DURATION", formatDuration(stats.durationSec)],
    ["XP EARNED", `+${stats.xp}`],
    ["STREAK", `${stats.currentStreak}🔥`],
  ];
  const gridTop = 232;
  statList.forEach(([label, value], i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = 28 + col * 175;
    const y = gridTop + row * 76;
    ctx.fillStyle = "rgba(139,139,143,1)";
    ctx.font = "600 11px 'Inter', sans-serif";
    ctx.fillText(label, x, y);
    ctx.fillStyle = "#f5f5f4";
    ctx.font = "700 28px 'Space Grotesk', sans-serif";
    ctx.fillText(value, x, y + 32);
  });

  // Footer divider + longest streak / rank
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.beginPath();
  ctx.moveTo(28, 400);
  ctx.lineTo(352, 400);
  ctx.stroke();

  ctx.fillStyle = "rgba(139,139,143,1)";
  ctx.font = "500 12px 'Inter', sans-serif";
  ctx.fillText(`Longest streak: ${stats.longestStreak} days${stats.rank ? `  ·  Rank #${stats.rank}` : ""}`, 28, 428);

  return canvas.toDataURL("image/png");
}

function formatDuration(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

type Transform = { x: number; y: number; scale: number; rotate: number };

export default function ShareCardEditor({ stats, onClose }: { stats: Stats; onClose: () => void }) {
  const [stickerUrl, setStickerUrl] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [transform, setTransform] = useState<Transform>({ x: 0.5, y: 0.5, scale: 0.7, rotate: 0 });
  const stageRef = useRef<HTMLDivElement | null>(null);
  const dragState = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const gestureState = useRef<{ startDist: number; startAngle: number; origScale: number; origRotate: number } | null>(null);

  useEffect(() => {
    setStickerUrl(renderStickerDataUrl(stats));
  }, [stats]);

  const onPhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPhotoUrl(reader.result as string);
    reader.readAsDataURL(file);
  };

  const downloadSticker = () => {
    if (!stickerUrl) return;
    const a = document.createElement("a");
    a.href = stickerUrl;
    a.download = "pushquest-sticker.png";
    a.click();
  };

  const exportComposite = useCallback(async () => {
    if (!stageRef.current) return;
    const { toPng } = await import("html-to-image");
    const dataUrl = await toPng(stageRef.current, { pixelRatio: 2, cacheBust: true });
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = "pushquest-share.png";
    a.click();
  }, []);

  // Drag to move
  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    dragState.current = { startX: e.clientX, startY: e.clientY, origX: transform.x, origY: transform.y };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragState.current || !stageRef.current) return;
    const rect = stageRef.current.getBoundingClientRect();
    const dx = (e.clientX - dragState.current.startX) / rect.width;
    const dy = (e.clientY - dragState.current.startY) / rect.height;
    setTransform((t) => ({ ...t, x: clamp01(dragState.current!.origX + dx), y: clamp01(dragState.current!.origY + dy) }));
  };
  const onPointerUp = () => {
    dragState.current = null;
  };

  // Resize/rotate via a handle at the corner.
  const onHandlePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    if (!stageRef.current) return;
    const rect = stageRef.current.getBoundingClientRect();
    const cx = rect.left + transform.x * rect.width;
    const cy = rect.top + transform.y * rect.height;
    const dist = Math.hypot(e.clientX - cx, e.clientY - cy);
    const angle = Math.atan2(e.clientY - cy, e.clientX - cx);
    gestureState.current = { startDist: dist, startAngle: angle, origScale: transform.scale, origRotate: transform.rotate };
  };
  const onHandlePointerMove = (e: React.PointerEvent) => {
    if (!gestureState.current || !stageRef.current) return;
    const rect = stageRef.current.getBoundingClientRect();
    const cx = rect.left + transform.x * rect.width;
    const cy = rect.top + transform.y * rect.height;
    const dist = Math.hypot(e.clientX - cx, e.clientY - cy);
    const angle = Math.atan2(e.clientY - cy, e.clientX - cx);
    const scaleRatio = dist / Math.max(1, gestureState.current.startDist);
    const rotateDelta = ((angle - gestureState.current.startAngle) * 180) / Math.PI;
    setTransform((t) => ({
      ...t,
      scale: clamp(gestureState.current!.origScale * scaleRatio, 0.25, 1.6),
      rotate: gestureState.current!.origRotate + rotateDelta,
    }));
  };
  const onHandlePointerUp = () => {
    gestureState.current = null;
  };

  return (
    <div className="fixed inset-0 z-50 bg-base-950 flex flex-col">
      <div className="flex items-center justify-between px-5 py-4">
        <button onClick={onClose} className="text-ink-300 text-sm">Cancel</button>
        <h2 className="font-display font-semibold">Share Card</h2>
        <button onClick={downloadSticker} className="text-volt-500 text-sm font-medium">Sticker PNG</button>
      </div>

      <div className="flex-1 px-5 flex flex-col gap-4">
        <div
          ref={stageRef}
          className="relative w-full aspect-[9/16] rounded-2xl overflow-hidden bg-base-900 border border-base-700/60 touch-none select-none"
          onPointerMove={(e) => { onPointerMove(e); }}
          onPointerUp={onPointerUp}
        >
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-ink-700 text-sm">Upload a photo below (optional)</div>
          )}

          {stickerUrl && (
            <div
              className="absolute cursor-grab active:cursor-grabbing"
              style={{
                left: `${transform.x * 100}%`,
                top: `${transform.y * 100}%`,
                width: 190 * transform.scale,
                transform: `translate(-50%, -50%) rotate(${transform.rotate}deg)`,
              }}
              onPointerDown={onPointerDown}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={stickerUrl} alt="stat sticker" className="w-full drop-shadow-2xl pointer-events-none" draggable={false} />
              <div
                onPointerDown={onHandlePointerDown}
                onPointerMove={onHandlePointerMove}
                onPointerUp={onHandlePointerUp}
                className="absolute -bottom-3 -right-3 w-7 h-7 rounded-full bg-volt-500 border-2 border-base-950 flex items-center justify-center cursor-nwse-resize"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#0a0a0b" strokeWidth="2.5"><path d="M21 3l-7 7M14 3h7v7M3 21l7-7M10 21H3v-7" /></svg>
              </div>
            </div>
          )}
        </div>

        <label className="btn-ghost w-full py-3 text-center text-sm cursor-pointer">
          {photoUrl ? "Change Photo" : "Upload Your Photo"}
          <input type="file" accept="image/*" className="hidden" onChange={onPhotoChange} />
        </label>

        <p className="text-ink-700 text-xs text-center">Drag the sticker to reposition. Use the orange handle to resize &amp; rotate.</p>

        <button onClick={exportComposite} className="btn-volt w-full py-4 font-display font-bold mt-auto mb-6">
          Export Image
        </button>
      </div>
    </div>
  );
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}
function clamp01(v: number) {
  return clamp(v, 0.05, 0.95);
}
