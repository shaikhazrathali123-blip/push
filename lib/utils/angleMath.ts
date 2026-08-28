import { Landmark, PoseAngles, FormFeedback } from '../types';

/**
Calculates the angle (in degrees) at point B given 3 points: A, B, C
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
Smooth landmarks using exponential moving average (EMA)
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
Extracts key push-up biomechanics from 33 MediaPipe pose landmarks
*/
export function analyzePushupPose(
  landmarks: Landmark[],
  targetDepthAngle: number = 90
): { angles: PoseAngles; feedback: FormFeedback } {
  if (!landmarks || landmarks.length < 29) {
    return {
      angles: {
        leftElbowAngle: 180, rightElbowAngle: 180, activeElbowAngle: 180,
        bodyAlignmentAngle: 180, activeLegAngle: 180, depthPercentage: 0,
        isFacingLeft: true, visibilityScore: 0,
      },
      feedback: {
        isValidPlank: false, isGoodDepth: false, isFullExtension: false,
        isLegsVisible: false, isLegsStraight: false,
        message: 'Position full body in camera view',
        type: 'info', score: 0,
      },
    };
  }

  const leftShoulder = landmarks[11]; const rightShoulder = landmarks[12];
  const leftElbow = landmarks[13];     const rightElbow = landmarks[14];
  const leftWrist = landmarks[15];     const rightWrist = landmarks[16];
  const leftHip = landmarks[23];       const rightHip = landmarks[24];
  const leftKnee = landmarks[25];      const rightKnee = landmarks[26];
  const leftAnkle = landmarks[27];     const rightAnkle = landmarks[28];

  // 1. Check landmark visibility / confidence
  const leftSideVis = (leftShoulder.visibility ?? 1) + (leftElbow.visibility ?? 1) + (leftWrist.visibility ?? 1) + (leftHip.visibility ?? 1);
  const rightSideVis = (rightShoulder.visibility ?? 1) + (rightElbow.visibility ?? 1) + (rightWrist.visibility ?? 1) + (rightHip.visibility ?? 1);
  const isLeftSidePrimary = leftSideVis >= rightSideVis;
  
  const avgVisibility = (leftSideVis + rightSideVis) / 8;

  // 2. ANTI-CHEAT: Leg Visibility Check (Must see knees and ankles)
  const legVisibilityScore = Math.min(
    leftKnee.visibility ?? 0, rightKnee.visibility ?? 0,
    leftAnkle.visibility ?? 0, rightAnkle.visibility ?? 0
  );
  const isLegsVisible = legVisibilityScore > 0.5;

  // 3. Angles
  const leftElbowAngle = calculateAngle(leftShoulder, leftElbow, leftWrist);
  const rightElbowAngle = calculateAngle(rightShoulder, rightElbow, rightWrist);
  const activeElbowAngle = isLeftSidePrimary ? leftElbowAngle : rightElbowAngle;

  const leftBodyAngle = calculateAngle(leftShoulder, leftHip, leftAnkle);
  const rightBodyAngle = calculateAngle(rightShoulder, rightHip, rightAnkle);
  const bodyAlignmentAngle = isLeftSidePrimary ? leftBodyAngle : rightBodyAngle;

  // 4. ANTI-CHEAT: Leg Straightness Check (Prevents Knee Pushups)
  const leftLegAngle = calculateAngle(leftHip, leftKnee, leftAnkle);
  const rightLegAngle = calculateAngle(rightHip, rightKnee, rightAnkle);
  const activeLegAngle = isLeftSidePrimary ? leftLegAngle : rightLegAngle;
  const isLegsStraight = activeLegAngle > 160; // >160 means straight, <160 means bent/kneeling

  // Depth calculation
  const maxLockoutAngle = 160;
  const bottomTarget = targetDepthAngle;
  let depthPercentage = 0;
  if (activeElbowAngle <= bottomTarget) depthPercentage = 100;
  else if (activeElbowAngle >= maxLockoutAngle) depthPercentage = 0;
  else depthPercentage = Math.round(((maxLockoutAngle - activeElbowAngle) / (maxLockoutAngle - bottomTarget)) * 100);

  // Form checks
  const isPlankSagging = bodyAlignmentAngle < 152;
  const isPlankPiking = bodyAlignmentAngle > 188;
  const isValidPlank = !isPlankSagging && !isPlankPiking;
  
  const isGoodDepth = activeElbowAngle <= (targetDepthAngle + 5);
  const isFullExtension = activeElbowAngle >= 155;

  // Feedback messaging & scoring
  let message = 'Ready to rep';
  let type: FormFeedback['type'] = 'good';
  let score = 95;

  if (!isLegsVisible) {
    message = 'Move back! Knees & feet must be visible';
    type = 'warning';
    score = 0;
  } else if (!isLegsStraight) {
    message = 'Strict form only! Keep legs straight (No knee pushups)';
    type = 'warning';
    score = Math.max(20, score - 50);
  } else if (isPlankSagging) {
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

  return {
    angles: {
      leftElbowAngle, rightElbowAngle, activeElbowAngle,
      bodyAlignmentAngle, activeLegAngle, depthPercentage,
      isFacingLeft: isLeftSidePrimary,
      visibilityScore: Math.min(1, Math.max(0, avgVisibility)),
    },
    feedback: {
      isValidPlank, isGoodDepth, isFullExtension, isLegsVisible, isLegsStraight,
      message, type, score,
    },
  };
}