"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PushupEngine, drawPoseSkeleton } from "@/lib/pushup/engine";
import { Landmark, PoseAngles, FormFeedback, PushupState } from "@/lib/types";

const WASM_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

export interface LiveRepEvent {
  valid: boolean;
  repNumber: number;
  formScore: number; // 0-1, matches the app's DB/API contract
  depthAngle: number;
  timestamp: number;
}

/**
 * Encapsulates: camera permission + stream -> MediaPipe PoseLandmarker
 * (runs fully on-device via WASM/WebGL, no frames ever leave the phone) ->
 * per-frame joint angles (lib/utils/angleMath) -> PushupEngine state machine
 * (lib/pushup/engine) -> rep callbacks.
 */
export function usePushupCamera(opts: {
  onRep: (rep: LiveRepEvent) => void;
  targetDepthAngle?: number;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const landmarkerRef = useRef<any>(null);
  const engineRef = useRef<PushupEngine | null>(null);
  const rafRef = useRef<number | null>(null);
  const runningRef = useRef(false);
  const latestPoseRef = useRef<{ angles: PoseAngles; feedback: FormFeedback; state: PushupState; landmarks: Landmark[] } | null>(null);

  const [status, setStatus] = useState<"idle" | "requesting" | "loading-model" | "ready" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [liveState, setLiveState] = useState<string>("IDLE");
  const [liveConfidence, setLiveConfidence] = useState(0);
  const [fps, setFps] = useState(0);

  const onRepRef = useRef(opts.onRep);
  onRepRef.current = opts.onRep;

  if (!engineRef.current) {
    engineRef.current = new PushupEngine(
      {
        onRepCounted: (rep, formScore, depthAngle) => {
          onRepRef.current({
            valid: true,
            repNumber: rep,
            formScore: Math.max(0, Math.min(1, formScore / 100)),
            depthAngle,
            timestamp: Date.now(),
          });
        },
        onStateChange: (state) => setLiveState(state),
        onPoseUpdate: (angles, feedback, state) => {
          latestPoseRef.current = { angles, feedback, state, landmarks: latestPoseRef.current?.landmarks ?? [] };
          setLiveConfidence(angles.visibilityScore);
        },
        onDownTriggered: () => {
          if (navigator.vibrate) navigator.vibrate(15);
        },
      },
      opts.targetDepthAngle ?? 90
    );
  }

  useEffect(() => {
    engineRef.current?.setTargetDepth(opts.targetDepthAngle ?? 90);
  }, [opts.targetDepthAngle]);

  const start = useCallback(async () => {
    setStatus("requesting");
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setStatus("loading-model");
      // Dynamic import keeps the (fairly large) MediaPipe bundle out of every other route.
      const { FilesetResolver, PoseLandmarker } = await import("@mediapipe/tasks-vision");
      const vision = await FilesetResolver.forVisionTasks(WASM_BASE);

      let landmarker;
      try {
        landmarker = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
          runningMode: "VIDEO",
          numPoses: 1,
        });
      } catch {
        // GPU delegate can fail on some devices/browsers — fall back to CPU.
        landmarker = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: "CPU" },
          runningMode: "VIDEO",
          numPoses: 1,
        });
      }
      landmarkerRef.current = landmarker;

      setStatus("ready");
      runningRef.current = true;
      let lastFpsSample = performance.now();
      let frameCount = 0;

      const loop = () => {
        if (!runningRef.current || !videoRef.current || !landmarkerRef.current) return;
        const now = performance.now();
        try {
          if (videoRef.current.readyState >= 2) {
            const result = landmarkerRef.current.detectForVideo(videoRef.current, now);
            const raw = result?.landmarks?.[0] as Array<{ x: number; y: number; z: number; visibility?: number }> | undefined;
            if (raw && raw.length >= 29) {
              const landmarks: Landmark[] = raw.map((p) => ({ x: p.x, y: p.y, z: p.z, visibility: p.visibility }));
              if (latestPoseRef.current) latestPoseRef.current.landmarks = landmarks;
              else latestPoseRef.current = { angles: {} as PoseAngles, feedback: {} as FormFeedback, state: "IDLE", landmarks };
              engineRef.current!.processPose(landmarks);
              renderOverlay(canvasRef.current, videoRef.current, latestPoseRef.current);
            } else {
              clearCanvas(canvasRef.current);
            }
          }
        } catch (e) {
          // Transient detection errors (e.g. a dropped frame) shouldn't kill the loop.
        }
        frameCount++;
        if (now - lastFpsSample > 1000) {
          setFps(frameCount);
          frameCount = 0;
          lastFpsSample = now;
        }
        rafRef.current = requestAnimationFrame(loop);
      };
      rafRef.current = requestAnimationFrame(loop);
    } catch (e: any) {
      setStatus("error");
      setError(e?.message ?? "Camera access failed");
    }
  }, [opts.targetDepthAngle]);

  const stop = useCallback(() => {
    runningRef.current = false;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    const stream = videoRef.current?.srcObject as MediaStream | null;
    stream?.getTracks().forEach((t) => t.stop());
    if (videoRef.current) videoRef.current.srcObject = null;
    landmarkerRef.current?.close?.();
    landmarkerRef.current = null;
  }, []);

  useEffect(() => stop, [stop]);

  return {
    videoRef,
    canvasRef,
    start,
    stop,
    status,
    error,
    liveState,
    liveConfidence,
    fps,
    resetRepCount: () => engineRef.current?.resetRepCount(),
    startNewSet: () => engineRef.current?.startNewSet(),
  };
}

function clearCanvas(canvas: HTMLCanvasElement | null) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  ctx?.clearRect(0, 0, canvas.width, canvas.height);
}

function renderOverlay(
  canvas: HTMLCanvasElement | null,
  video: HTMLVideoElement,
  pose: { angles: PoseAngles; feedback: FormFeedback; state: PushupState; landmarks: Landmark[] }
) {
  if (!canvas || !video.videoWidth) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  // mirror=false: the <canvas> element already gets a CSS `-scale-x-100`
  // (same as the <video>), so we draw in raw (unmirrored) coordinates here.
  drawPoseSkeleton(ctx, pose.landmarks, pose.angles, pose.feedback, pose.state, canvas.width, canvas.height, false);
}
