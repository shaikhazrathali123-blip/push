/**
 * Shared types for the MediaPipe-based pushup detection pipeline.
 * Landmark shape matches MediaPipe Pose Landmarker's NormalizedLandmark
 * (x/y/z in [0,1] relative to the image, visibility in [0,1]).
 */

export interface Landmark {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
}

export type PushupState =
  | "IDLE"
  | "READY"
  | "DESCENDING"
  | "DOWN"
  | "ASCENDING"
  | "UP";

export interface PoseAngles {
  leftElbowAngle: number;
  rightElbowAngle: number;
  activeElbowAngle: number;
  bodyAlignmentAngle: number;
  depthPercentage: number;
  isFacingLeft: boolean;
  visibilityScore: number;
}

export interface FormFeedback {
  isValidPlank: boolean;
  isGoodDepth: boolean;
  isFullExtension: boolean;
  message: string;
  type: "good" | "warning" | "info";
  score: number; // 0-100
}
