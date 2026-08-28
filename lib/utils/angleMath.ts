import { Landmark, PoseAngles, FormFeedback } from '../types';

/**
 * Calculates the angle (in degrees) at point B given 3 points: A, B, C
 */
export function calculateAngle(a: Landmark, b: Landmark, c: Landmark): number {
  if (!a || !b || !c) return 180;
  
  const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
  let angle = Math.abs((radians * 180.0) / Math.PI);
  
  if (angle > 180.0) {
    angle = 360.0 - angle;
  }
  
  return Math.round(angle);
}

/**
 * Smooth landmarks using exponential moving average (EMA)
 */
export function smoothLandmarks(
  current: Landmark[],
  previous: Landmark[] | null,
  alpha: number = 0.65
): Landmark[] {
  if (!previous || previous.length !== current.length) {
    return current;
  }

  return current.map((curr, idx) => {
    const prev = previous[idx];
    if (!prev) return curr;
    
    return {
      x: curr.x * alpha + prev.x * (1 - alpha),
      y: curr.y * alpha + prev.y * (1 - alpha),
      z: curr.z !== undefined && prev.z !== undefined 
        ? curr.z * alpha + prev.z * (1 - alpha) 
        : curr.z,
      visibility: curr.visibility !== undefined && prev.visibility !== undefined
        ? curr.visibility * alpha + prev.visibility * (1 - alpha)
        : curr.visibility,
    };
  });
}

/**
 * Extracts key push-up biomechanics from 33 MediaPipe pose landmarks
 * Landmarks indices:
 * 11: left shoulder, 12: right shoulder
 * 13: left elbow,    14: right elbow
 * 15: left wrist,    16: right wrist
 * 23: left hip,      24: right hip
 * 25: left knee,     26: right knee
 * 27: left ankle,    28: right ankle
 */
export function analyzePushupPose(
  landmarks: Landmark[],
  targetDepthAngle: number = 90
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
      },
      feedback: {
        isValidPlank: false,
        isGoodDepth: false,
        isFullExtension: false,
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

  // Check landmark visibility / confidence
  const leftSideVis = (leftShoulder.visibility ?? 1) + (leftElbow.visibility ?? 1) + (leftWrist.visibility ?? 1) + (leftHip.visibility ?? 1);
  const rightSideVis = (rightShoulder.visibility ?? 1) + (rightElbow.visibility ?? 1) + (rightWrist.visibility ?? 1) + (rightHip.visibility ?? 1);
  const isLeftSidePrimary = leftSideVis >= rightSideVis;

  const leftElbowAngle = calculateAngle(leftShoulder, leftElbow, leftWrist);
  const rightElbowAngle = calculateAngle(rightShoulder, rightElbow, rightWrist);

  // Active elbow angle based on side facing camera
  const activeElbowAngle = isLeftSidePrimary ? leftElbowAngle : rightElbowAngle;

  // Body alignment: Shoulder -> Hip -> Ankle
  const leftBodyAngle = calculateAngle(leftShoulder, leftHip, leftAnkle);
  const rightBodyAngle = calculateAngle(rightShoulder, rightHip, rightAnkle);
  const bodyAlignmentAngle = isLeftSidePrimary ? leftBodyAngle : rightBodyAngle;

  // Depth calculation:
  // Lockout: ~160° (0% depth)
  // Target depth: targetDepthAngle (e.g. 90° = 100% depth)
  const maxLockoutAngle = 160;
  const bottomTarget = targetDepthAngle;
  let depthPercentage = 0;
  if (activeElbowAngle <= bottomTarget) {
    depthPercentage = 100;
  } else if (activeElbowAngle >= maxLockoutAngle) {
    depthPercentage = 0;
  } else {
    depthPercentage = Math.round(
      ((maxLockoutAngle - activeElbowAngle) / (maxLockoutAngle - bottomTarget)) * 100
    );
  }

  // Form checks
  // 1. Plank line: shoulder-hip-ankle should be between 155° and 185°
  const isPlankSagging = bodyAlignmentAngle < 152;
  const isPlankPiking = bodyAlignmentAngle > 188;
  const isValidPlank = !isPlankSagging && !isPlankPiking;

  // 2. Depth check
  const isGoodDepth = activeElbowAngle <= (targetDepthAngle + 5);

  // 3. Lockout extension check
  const isFullExtension = activeElbowAngle >= 155;

  // Feedback messaging & scoring
  let message = 'Ready to rep';
  let type: FormFeedback['type'] = 'good';
  let score = 95;

  if (isPlankSagging) {
    message = 'Hips sagging! Tighten core';
    type = 'warning';
    score = Math.max(40, score - 30);
  } else if (isPlankPiking) {
    message = 'Hips too high! Lower hips';
    type = 'warning';
    score = Math.max(50, score - 25);
  } else if (isGoodDepth) {
    message = 'Great depth! Push up now';
    type = 'good';
    score = 100;
  } else if (activeElbowAngle < 130 && !isGoodDepth) {
    message = `Go lower (${activeElbowAngle}° / ${targetDepthAngle}°)`;
    type = 'info';
    score = Math.max(60, score - 15);
  } else if (isFullExtension) {
    message = 'Full lockout • Lower down';
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
