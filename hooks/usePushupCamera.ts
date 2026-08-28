"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PushupStateMachine, computeFrameMetrics, RepResult, FrameMetrics } from "@/lib/pushup-detector";

type Detector = {
  estimatePoses: (input: HTMLVideoElement) => Promise<Array<{ keypoints: Array<{ x: number; y: number; score?: number; name?: string }> }>>;
};

export interface LiveRepEvent extends RepResult {}

/**
 * Encapsulates: camera permission + stream -> TensorFlow.js MoveNet Lightning
 * (runs on-device via WebGL, no frames ever leave the phone) -> per-frame
 * joint metrics -> PushupStateMachine -> rep callbacks.
 *
 * Model + camera both run in the browser; nothing here calls a server.
 */
export function usePushupCamera(opts: {
  onRep: (rep: LiveRepEvent) => void;
  downElbowAngle?: number;
  upElbowAngle?: number;
  maxBodySag?: number;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const detectorRef = useRef<Detector | null>(null);
  const machineRef = useRef<PushupStateMachine>(
    new PushupStateMachine({
      downElbowAngle: opts.downElbowAngle,
      upElbowAngle: opts.upElbowAngle,
      maxBodySag: opts.maxBodySag,
    })
  );
  const rafRef = useRef<number | null>(null);
  const runningRef = useRef(false);

  const [status, setStatus] = useState<"idle" | "requesting" | "loading-model" | "ready" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [liveState, setLiveState] = useState<string>("IDLE");
  const [liveConfidence, setLiveConfidence] = useState(0);
  const [fps, setFps] = useState(0);

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
      // Dynamic import keeps TF.js out of the initial bundle for every other route.
      const tf = await import("@tensorflow/tfjs-core");
      await import("@tensorflow/tfjs-backend-webgl");
      const poseDetection = await import("@tensorflow-models/pose-detection");
      await tf.ready();

      const detector = await poseDetection.createDetector(poseDetection.SupportedModels.MoveNet, {
        modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING,
      });
      detectorRef.current = detector as unknown as Detector;

      setStatus("ready");
      runningRef.current = true;
      let lastFpsSample = performance.now();
      let frameCount = 0;

      const loop = async () => {
        if (!runningRef.current || !videoRef.current || !detectorRef.current) return;
        const now = performance.now();
        try {
          const poses = await detectorRef.current.estimatePoses(videoRef.current);
          if (poses[0]) {
            const pose = {
              keypoints: poses[0].keypoints.map((k) => ({
                x: k.x,
                y: k.y,
                score: k.score ?? 0,
                name: k.name ?? "",
              })),
            };
            const metrics: FrameMetrics = computeFrameMetrics(pose, machineRef.current.getThresholds());
            const rep = machineRef.current.process(metrics, now);
            setLiveState(machineRef.current.getState());
            setLiveConfidence(metrics.confidence);
            if (rep) opts.onRep(rep);
            drawOverlay(canvasRef.current, videoRef.current, pose.keypoints);
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
  }, [opts]);

  const stop = useCallback(() => {
    runningRef.current = false;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    const stream = videoRef.current?.srcObject as MediaStream | null;
    stream?.getTracks().forEach((t) => t.stop());
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  useEffect(() => stop, [stop]);

  return { videoRef, canvasRef, start, stop, status, error, liveState, liveConfidence, fps, machine: machineRef.current };
}

function drawOverlay(
  canvas: HTMLCanvasElement | null,
  video: HTMLVideoElement,
  keypoints: Array<{ x: number; y: number; score: number; name: string }>
) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const EDGES: Array<[string, string]> = [
    ["left_shoulder", "right_shoulder"],
    ["left_shoulder", "left_elbow"],
    ["left_elbow", "left_wrist"],
    ["right_shoulder", "right_elbow"],
    ["right_elbow", "right_wrist"],
    ["left_shoulder", "left_hip"],
    ["right_shoulder", "right_hip"],
    ["left_hip", "right_hip"],
    ["left_hip", "left_ankle"],
    ["right_hip", "right_ankle"],
  ];
  const byName = Object.fromEntries(keypoints.map((k) => [k.name, k]));

  ctx.strokeStyle = "rgba(255,107,26,0.85)";
  ctx.lineWidth = 3;
  for (const [a, b] of EDGES) {
    const pa = byName[a];
    const pb = byName[b];
    if (pa && pb && pa.score > 0.35 && pb.score > 0.35) {
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
      ctx.stroke();
    }
  }
  ctx.fillStyle = "#ff8a3d";
  for (const k of keypoints) {
    if (k.score > 0.35) {
      ctx.beginPath();
      ctx.arc(k.x, k.y, 4, 0, 2 * Math.PI);
      ctx.fill();
    }
  }
}
