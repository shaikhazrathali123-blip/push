/**
Shared types for the MediaPipe-based pushup detection pipeline.
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
  torsoTiltDegrees: number;   // NEW: 0° = horizontal (plank), 90° = vertical (standing)
  isPlankPosition: boolean;   // NEW: true only when torso is horizontal enough to count reps
}


export interface FormFeedback {
  isValidPlank: boolean;
  isGoodDepth: boolean;
  isFullExtension: boolean;
  isLegsVisible: boolean;  // NEW: Ensures full body is in frame
  isLegsStraight: boolean; // NEW: Prevents knee pushups
  message: string;
  type: "good" | "warning" | "info";
  score: number; // 0-100
  
}