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
  private minRepDurationMs = 500; 
  private timeInBottomStateMs = 0;
  private lastBottomTimestamp = 0;
  
  // ANTI-CHEAT: Tracks if strict form was broken during the active rep
  private repFormValid = true; 

  constructor(callbacks: PushupEngineCallbacks, targetDepthAngle: number = 90) {
    this.callbacks = callbacks;
    this.targetDepthAngle = targetDepthAngle;
  }

  public setTargetDepth(angle: number) { this.targetDepthAngle = angle; }
  
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

    const smoothed = smoothLandmarks(rawLandmarks, this.previousLandmarks, 0.6);
    this.previousLandmarks = smoothed;

    const { angles, feedback } = analyzePushupPose(smoothed, this.targetDepthAngle);
    const now = Date.now();
    const elbowAngle = angles.activeElbowAngle;

    if (this.state === 'DESCENDING' || this.state === 'DOWN') {
      if (elbowAngle < this.minAngleReachedInRep) {
        this.minAngleReachedInRep = elbowAngle;
      }
    }

    // ANTI-CHEAT: Continuously monitor leg straightness & visibility during the rep
    if (this.state === 'DESCENDING' || this.state === 'DOWN' || this.state === 'ASCENDING') {
      if (!feedback.isLegsStraight || !feedback.isLegsVisible || !feedback.isValidPlank) {
        this.repFormValid = false;
      }
    }

    const LOCKOUT_THRESHOLD = 155;
    const DESCENT_START_THRESHOLD = 135;
    const BOTTOM_DEPTH_THRESHOLD = this.targetDepthAngle + 4;
    const ASCENT_THRESHOLD = 115;

    switch (this.state) {
      case 'IDLE':
        if (elbowAngle >= LOCKOUT_THRESHOLD && angles.visibilityScore > 0.5 && feedback.isLegsVisible && feedback.isLegsStraight) {
          this.state = 'READY';
          this.callbacks.onStateChange(this.state);
        }
        break;
      case 'READY':
        if (elbowAngle < DESCENT_START_THRESHOLD && angles.visibilityScore > 0.5) {
          this.state = 'DESCENDING';
          this.repStartTimestamp = now;
          this.minAngleReachedInRep = elbowAngle;
          this.repFormValid = true; // Reset form validity for new rep
          this.callbacks.onStateChange(this.state);
        }
        break;
      case 'DESCENDING':
        if (elbowAngle <= BOTTOM_DEPTH_THRESHOLD) {
          this.state = 'DOWN';
          this.lastBottomTimestamp = now;
          soundManager.playDownCue();
          this.callbacks.onDownTriggered();
          this.callbacks.onStateChange(this.state);
        } else if (elbowAngle >= LOCKOUT_THRESHOLD) {
          this.state = 'READY';
          this.callbacks.onStateChange(this.state);
        }
        break;
      case 'DOWN':
        if (elbowAngle > ASCENT_THRESHOLD) {
          this.state = 'ASCENDING';
          this.callbacks.onStateChange(this.state);
        }
        break;
      case 'ASCENDING':
        if (elbowAngle >= LOCKOUT_THRESHOLD) {
          const repDuration = now - this.repStartTimestamp;
          const timeSinceLastRep = now - this.lastRepTimestamp;
          
          // ANTI-CHEAT: Strict form validation at the top of the rep
          if (repDuration >= this.minRepDurationMs && timeSinceLastRep > 400) {
            if (this.repFormValid) {
              this.repCount++;
              this.currentSetReps++;
              this.lastRepTimestamp = now;

              let repScore = feedback.score;
              if (this.minAngleReachedInRep <= this.targetDepthAngle) {
                repScore = Math.min(100, repScore + 5);
              }
              this.repFormScores.push(repScore);
              soundManager.playRepCount(this.repCount);
              this.callbacks.onRepCounted(this.repCount, repScore, this.minAngleReachedInRep);
            } else {
              // Rep rejected due to bad form (knee pushup or hips sagging)
              this.state = 'READY';
              this.minAngleReachedInRep = 180;
              this.callbacks.onStateChange(this.state);
              
              // Force warning message to UI
              feedback.message = 'Rep Rejected: Maintain strict form!';
              feedback.type = 'warning';
              feedback.score = 0;
              this.callbacks.onPoseUpdate(angles, feedback, this.state);
              return; 
            }
          }
          
          this.state = 'UP';
          this.callbacks.onStateChange(this.state);
          
          setTimeout(() => {
            if (this.state === 'UP') {
              this.state = 'READY';
              this.minAngleReachedInRep = 180;
              this.callbacks.onStateChange(this.state);
            }
          }, 150);
        } else if (elbowAngle <= BOTTOM_DEPTH_THRESHOLD) {
          this.state = 'DOWN';
          this.callbacks.onStateChange(this.state);
        }
        break;
      case 'UP':
        if (elbowAngle < DESCENT_START_THRESHOLD) {
          this.state = 'DESCENDING';
          this.repStartTimestamp = now;
          this.minAngleReachedInRep = elbowAngle;
          this.repFormValid = true; // Reset form validity
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

  public getCurrentSetReps(): number { return this.currentSetReps; }
  public getTotalReps(): number { return this.repCount; }
}

/**
Renders skeleton overlay onto canvas
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

  const connections: [number, number][] = [
    [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
    [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28],
  ];

  // Pick color based on state & form
  let strokeColor = '#f97316'; // orange default
  if (!feedback.isLegsStraight || !feedback.isLegsVisible) {
    strokeColor = '#ef4444'; // red warning for knee pushups or missing legs
  } else if (!feedback.isValidPlank) {
    strokeColor = '#f59e0b'; // amber for hip sag/pike
  } else if (state === 'DOWN' || feedback.isGoodDepth) {
    strokeColor = '#22c55e'; // green depth reached
  } else if (state === 'DESCENDING') {
    strokeColor = '#f97316';
  } else if (state === 'READY') {
    strokeColor = '#38bdf8'; // light cyan ready
  }

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
    if ([11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28].includes(idx)) {
      if ((p.visibility ?? 1) > 0.4) {
        ctx.beginPath();
        const isElbow = idx === 13 || idx === 14;
        const isKnee = idx === 25 || idx === 26;
        const isAnkle = idx === 27 || idx === 28;
        
        let radius = 5;
        let fillColor = '#ffffff';
        
        if (isElbow) {
          radius = 8;
          fillColor = '#ff5500';
        } else if (isKnee || isAnkle) {
          radius = 7;
          // Highlight legs: Red if bent/invisible, Green if strict
          fillColor = (feedback.isLegsStraight && feedback.isLegsVisible) ? '#22c55e' : '#ef4444';
        }

        ctx.arc(p.x * width, p.y * height, radius, 0, 2 * Math.PI);
        ctx.fillStyle = fillColor;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#000000';
        ctx.stroke();
      }
    }
  });
  ctx.restore();
}