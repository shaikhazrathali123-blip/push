import { Landmark, PoseAngles, FormFeedback } from '../types';

export function calculateAngle(a: Landmark, b: Landmark, c: Landmark): number {
  if (!a || !b || !c) return 180;
  const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
  let angle = Math.abs((radians * 180.0) / Math.PI);
  if (angle > 180.0) angle = 360.0 - angle;
  return Math.round(angle);
}

export function smoothLandmarks(
  current: Landmark[],
  previous: Landmark[] | null,
  alpha: number = 0.65
): Landmark[] {
  if (!previous || previous.length !== current.length) return current;
  return current.map((curr, idx) => {
    const prev = previous[idx];
    if (!prev) return curr;
    return {
      x: curr.x * alpha + prev.x * (1 - alpha),
      y: curr.y * alpha + prev.y * (1 - alpha),
      z: curr.z !== undefined && prev.z !== undefined ? curr.z * alpha + prev.z * (1 - alpha) : curr.z,
      visibility:
        curr.visibility !== undefined && prev.visibility !== undefined
          ? curr.visibility * alpha + prev.visibility * (1 - alpha)
          : curr.visibility,
    };
  });
}

export interface PlankToleranceOptions {
  sagFloorDegrees: number;
  pikeCeilingDegrees: number;
  maxTorsoTiltDegrees: number;
}

export const DEFAULT_PLANK_TOLERANCE: PlankToleranceOptions = {
  sagFloorDegrees: 140,
  pikeCeilingDegrees: 200,
  // Generous by default since this now only gates rep START, not every frame.
  maxTorsoTiltDegrees: 70,
};

/**
 * How far the torso (shoulder -> hip line) is tilted from horizontal.
 * 0° = flat/horizontal (plank). ~90° = vertical (standing).
 */
export function calculateTorsoTiltFromHorizontal(shoulder: Landmark, hip: Landmark): number {
  if (!shoulder || !hip) return 90;
  const dx = Math.abs(shoulder.x - hip.x);
  const dy = Math.abs(shoulder.y - hip.y);
  if (dx === 0 && dy === 0) return 90;
  const radians = Math.atan2(dy, dx);
  return Math.round((radians * 180) / Math.PI);
}

export function analyzePushupPose(
  landmarks: Landmark[],
  targetDepthAngle: number = 90,
  plankTolerance: PlankToleranceOptions = DEFAULT_PLANK_TOLERANCE
): { angles: PoseAngles; feedback: FormFeedback } {
  if (!landmarks || landmarks.length < 29) {
    return {
      angles: {
        leftElbowAngle: 180,
        rightElbowAngle: 180,
        activeElbowAngle: 180,
        bodyAlignmentAngle: 180,
        depthPercentage: 0,
        isFacingLeft: true,
        visibilityScore: 0,
        torsoTiltDegrees: 90,
        isPlankPosition: false,
      },
      feedback: {
     isValidPlank: false,
  isGoodDepth: false,
  isFullExtension: false,
  isLegsVisible: false,
  isLegsStraight: false,
        message: 'Position full body in camera view',
        type: 'info',
        score: 0,
      },
    };
  }

  const leftShoulder = landmarks[11];
  const rightShoulder = landmarks[12];
  const leftElbow = landmarks[13];
  const rightElbow = landmarks[14];
  const leftWrist = landmarks[15];
  const rightWrist = landmarks[16];
  const leftHip = landmarks[23];
  const rightHip = landmarks[24];
  const leftAnkle = landmarks[27];
  const rightAnkle = landmarks[28];

  const leftSideVis = (leftShoulder.visibility ?? 1) + (leftElbow.visibility ?? 1) + (leftWrist.visibility ?? 1) + (leftHip.visibility ?? 1);
  const rightSideVis = (rightShoulder.visibility ?? 1) + (rightElbow.visibility ?? 1) + (rightWrist.visibility ?? 1) + (rightHip.visibility ?? 1);
  const isLeftSidePrimary = leftSideVis >= rightSideVis;

  const leftElbowAngle = calculateAngle(leftShoulder, leftElbow, leftWrist);
  const rightElbowAngle = calculateAngle(rightShoulder, rightElbow, rightWrist);
  const activeElbowAngle = isLeftSidePrimary ? leftElbowAngle : rightElbowAngle;

  const leftBodyAngle = calculateAngle(leftShoulder, leftHip, leftAnkle);
  const rightBodyAngle = calculateAngle(rightShoulder, rightHip, rightAnkle);
  const bodyAlignmentAngle = isLeftSidePrimary ? leftBodyAngle : rightBodyAngle;

  const leftTorsoTilt = calculateTorsoTiltFromHorizontal(leftShoulder, leftHip);
  const rightTorsoTilt = calculateTorsoTiltFromHorizontal(rightShoulder, rightHip);
  const torsoTiltDegrees = isLeftSidePrimary ? leftTorsoTilt : rightTorsoTilt;
  const isPlankPosition = torsoTiltDegrees <= plankTolerance.maxTorsoTiltDegrees;

  const maxLockoutAngle = 160;
  const bottomTarget = targetDepthAngle;
  let depthPercentage = 0;
  if (activeElbowAngle <= bottomTarget) {
    depthPercentage = 100;
  } else if (activeElbowAngle >= maxLockoutAngle) {
    depthPercentage = 0;
  } else {
    depthPercentage = Math.round(((maxLockoutAngle - activeElbowAngle) / (maxLockoutAngle - bottomTarget)) * 100);
  }

  const isPlankSagging = bodyAlignmentAngle < plankTolerance.sagFloorDegrees;
  const isPlankPiking = bodyAlignmentAngle > plankTolerance.pikeCeilingDegrees;
  const isValidPlank = !isPlankSagging && !isPlankPiking && isPlankPosition;

  const isGoodDepth = activeElbowAngle <= targetDepthAngle + 12;
  const isFullExtension = activeElbowAngle >= 148;

  let message = 'Ready to rep';
  let type: FormFeedback['type'] = 'good';
  let score = 95;

  if (!isPlankPosition) {
    message = 'Get into plank position to start counting reps';
    type = 'info';
    score = 0;
  } else if (isPlankSagging) {
    message = 'Hips sagging a little - try to tighten your core';
    type = 'warning';
    score = Math.max(60, score - 15);
  } else if (isPlankPiking) {
    message = 'Hips a bit high - lower them slightly';
    type = 'warning';
    score = Math.max(65, score - 12);
  } else if (isGoodDepth) {
    message = 'Great depth! Push up now';
    type = 'good';
    score = 100;
  } else if (activeElbowAngle < 135 && !isGoodDepth) {
    message = `Go a little lower (${activeElbowAngle}° / ${targetDepthAngle}°)`;
    type = 'info';
    score = Math.max(70, score - 8);
  } else if (isFullExtension) {
    message = 'Nice lockout - lower down for the next rep';
    type = 'good';
    score = 98;
  }

  const avgVisibility = (leftSideVis + rightSideVis) / 8;

  return {
    angles: {
      leftElbowAngle,
      rightElbowAngle,
      activeElbowAngle,
      bodyAlignmentAngle,
      depthPercentage,
      isFacingLeft: isLeftSidePrimary,
      visibilityScore: Math.min(1, Math.max(0, avgVisibility)),
      torsoTiltDegrees,
      isPlankPosition,
    },
    feedback: {
      isValidPlank,
      isGoodDepth,
      isFullExtension,
      message,
      type,
      score,
    },
  };
}