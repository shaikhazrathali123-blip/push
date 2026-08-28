import { Landmark, PushupState, PoseAngles, FormFeedback } from '../types';
import { analyzePushupPose, smoothLandmarks } from '../utils/angleMath';
import { soundManager } from './sound';

export interface PushupEngineCallbacks {
  onRepCounted: (rep: number, formScore: number, depthAngle: number) => void;
  onStateChange: (state: PushupState) => void;
  onPoseUpdate: (angles: PoseAngles, feedback: FormFeedback, state: PushupState) => void;
  onDownTriggered: () => void;
}

export class PushupEngine {
  private state: PushupState = 'IDLE';
  private repCount = 0;
  private currentSetReps = 0;
  private minAngleReachedInRep = 180;
  private lastRepTimestamp = 0;
  private repStartTimestamp = 0;
  private targetDepthAngle = 90;
  private previousLandmarks: Landmark[] | null = null;
  private repFormScores: number[] = [];
  private callbacks: PushupEngineCallbacks;
  
  // State machine timing guards
  private minRepDurationMs = 500; // minimum time for a complete valid pushup
  private timeInBottomStateMs = 0;
  private lastBottomTimestamp = 0;

  constructor(callbacks: PushupEngineCallbacks, targetDepthAngle: number = 90) {
    this.callbacks = callbacks;
    this.targetDepthAngle = targetDepthAngle;
  }

  public setTargetDepth(angle: number) {
    this.targetDepthAngle = angle;
  }

  public resetRepCount() {
    this.repCount = 0;
    this.currentSetReps = 0;
    this.state = 'IDLE';
    this.minAngleReachedInRep = 180;
    this.repFormScores = [];
    this.callbacks.onStateChange(this.state);
  }

  public startNewSet() {
    this.currentSetReps = 0;
    this.state = 'IDLE';
    this.minAngleReachedInRep = 180;
    this.callbacks.onStateChange(this.state);
  }

  public manualIncrementRep() {
    this.repCount++;
    this.currentSetReps++;
    this.repFormScores.push(95);
    soundManager.playRepCount(this.repCount);
    this.callbacks.onRepCounted(this.repCount, 95, this.targetDepthAngle);
  }

  public processPose(rawLandmarks: Landmark[]) {
    if (!rawLandmarks || rawLandmarks.length < 29) return;

    // Exponential smoothing to eradicate webcam jitter
    const smoothed = smoothLandmarks(rawLandmarks, this.previousLandmarks, 0.6);
    this.previousLandmarks = smoothed;

    const { angles, feedback } = analyzePushupPose(smoothed, this.targetDepthAngle);
    const now = Date.now();
    const elbowAngle = angles.activeElbowAngle;

    // Track minimum angle reached during current rep descent
    if (this.state === 'DESCENDING' || this.state === 'DOWN') {
      if (elbowAngle < this.minAngleReachedInRep) {
        this.minAngleReachedInRep = elbowAngle;
      }
    }

    // STATE MACHINE TRANSITIONS
    const LOCKOUT_THRESHOLD = 155; // Arms extended top
    const DESCENT_START_THRESHOLD = 135; // Arms start bending
    const BOTTOM_DEPTH_THRESHOLD = this.targetDepthAngle + 4; // Reached bottom target
    const ASCENT_THRESHOLD = 115; // Pushing up

    switch (this.state) {
      case 'IDLE':
        // Wait until user enters a proper plank with arms extended
        if (elbowAngle >= LOCKOUT_THRESHOLD && angles.visibilityScore > 0.5) {
          this.state = 'READY';
          this.callbacks.onStateChange(this.state);
        }
        break;

      case 'READY':
        // Start descending
        if (elbowAngle < DESCENT_START_THRESHOLD && angles.visibilityScore > 0.5) {
          this.state = 'DESCENDING';
          this.repStartTimestamp = now;
          this.minAngleReachedInRep = elbowAngle;
          this.callbacks.onStateChange(this.state);
        }
        break;

      case 'DESCENDING':
        // Reached target depth!
        if (elbowAngle <= BOTTOM_DEPTH_THRESHOLD) {
          this.state = 'DOWN';
          this.lastBottomTimestamp = now;
          soundManager.playDownCue();
          this.callbacks.onDownTriggered();
          this.callbacks.onStateChange(this.state);
        } else if (elbowAngle >= LOCKOUT_THRESHOLD) {
          // Aborted descent without going down
          this.state = 'READY';
          this.callbacks.onStateChange(this.state);
        }
        break;

      case 'DOWN':
        // Leaving bottom, starting ascent
        if (elbowAngle > ASCENT_THRESHOLD) {
          this.state = 'ASCENDING';
          this.callbacks.onStateChange(this.state);
        }
        break;

      case 'ASCENDING':
        // Reached full lockout at top -> VALID REP COUNT!
        if (elbowAngle >= LOCKOUT_THRESHOLD) {
          const repDuration = now - this.repStartTimestamp;
          const timeSinceLastRep = now - this.lastRepTimestamp;

          // Reject spam/glitch reps
          if (repDuration >= this.minRepDurationMs && timeSinceLastRep > 400) {
            this.repCount++;
            this.currentSetReps++;
            this.lastRepTimestamp = now;

            // Form score calculations
            let repScore = feedback.score;
            if (this.minAngleReachedInRep <= this.targetDepthAngle) {
              repScore = Math.min(100, repScore + 5);
            }
            this.repFormScores.push(repScore);

            soundManager.playRepCount(this.repCount);
            this.callbacks.onRepCounted(this.repCount, repScore, this.minAngleReachedInRep);
          }

          this.state = 'UP';
          this.callbacks.onStateChange(this.state);
          // Brief pulse then back to READY
          setTimeout(() => {
            if (this.state === 'UP') {
              this.state = 'READY';
              this.minAngleReachedInRep = 180;
              this.callbacks.onStateChange(this.state);
            }
          }, 150);
        } else if (elbowAngle <= BOTTOM_DEPTH_THRESHOLD) {
          // Dipped back down
          this.state = 'DOWN';
          this.callbacks.onStateChange(this.state);
        }
        break;

      case 'UP':
        if (elbowAngle < DESCENT_START_THRESHOLD) {
          this.state = 'DESCENDING';
          this.repStartTimestamp = now;
          this.minAngleReachedInRep = elbowAngle;
          this.callbacks.onStateChange(this.state);
        }
        break;
    }

    this.callbacks.onPoseUpdate(angles, feedback, this.state);
  }

  public getAverageFormScore(): number {
    if (this.repFormScores.length === 0) return 92;
    const sum = this.repFormScores.reduce((a, b) => a + b, 0);
    return Math.round(sum / this.repFormScores.length);
  }

  public getCurrentSetReps(): number {
    return this.currentSetReps;
  }

  public getTotalReps(): number {
    return this.repCount;
  }
}

/**
 * Renders skeleton overlay onto canvas
 */
export function drawPoseSkeleton(
  ctx: CanvasRenderingContext2D,
  landmarks: Landmark[],
  angles: PoseAngles,
  feedback: FormFeedback,
  state: PushupState,
  width: number,
  height: number,
  mirror: boolean = true
) {
  ctx.save();
  ctx.clearRect(0, 0, width, height);

  if (mirror) {
    ctx.translate(width, 0);
    ctx.scale(-1, 1);
  }

  if (!landmarks || landmarks.length < 29) {
    ctx.restore();
    return;
  }

  // Connections for upper body and pushup kinetic chain
  const connections: [number, number][] = [
    [11, 12], // shoulders
    [11, 13], [13, 15], // left arm
    [12, 14], [14, 16], // right arm
    [11, 23], [12, 24], // torso
    [23, 24], // hips
    [23, 25], [25, 27], // left leg
    [24, 26], [26, 28], // right leg
  ];

  // Pick color based on state & form
  let strokeColor = '#f97316'; // orange default
  if (!feedback.isValidPlank) {
    strokeColor = '#ef4444'; // red warning
  } else if (state === 'DOWN' || feedback.isGoodDepth) {
    strokeColor = '#22c55e'; // green depth reached
  } else if (state === 'DESCENDING') {
    strokeColor = '#f97316';
  } else if (state === 'READY') {
    strokeColor = '#38bdf8'; // light cyan ready
  }

  // Draw bone lines
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = strokeColor;
  ctx.shadowColor = strokeColor;
  ctx.shadowBlur = 10;

  connections.forEach(([i, j]) => {
    const p1 = landmarks[i];
    const p2 = landmarks[j];
    if (p1 && p2 && (p1.visibility ?? 1) > 0.4 && (p2.visibility ?? 1) > 0.4) {
      ctx.beginPath();
      ctx.moveTo(p1.x * width, p1.y * height);
      ctx.lineTo(p2.x * width, p2.y * height);
      ctx.stroke();
    }
  });

  // Draw joint nodes
  landmarks.forEach((p, idx) => {
    // Only key joints
    if ([11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28].includes(idx)) {
      if ((p.visibility ?? 1) > 0.4) {
        ctx.beginPath();
        const isElbow = idx === 13 || idx === 14;
        ctx.arc(p.x * width, p.y * height, isElbow ? 8 : 5, 0, 2 * Math.PI);
        ctx.fillStyle = isElbow ? '#ff5500' : '#ffffff';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#000000';
        ctx.stroke();
      }
    }
  });

  ctx.restore();
}
