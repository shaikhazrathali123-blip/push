import { Landmark, PushupState, PoseAngles, FormFeedback } from '../types';
import { analyzePushupPose, smoothLandmarks, PlankToleranceOptions, DEFAULT_PLANK_TOLERANCE } from '../utils/angleMath';
import { soundManager } from './sound';

export interface PushupEngineCallbacks {
  onRepCounted: (rep: number, formScore: number, depthAngle: number) => void;
  onStateChange: (state: PushupState) => void;
  onPoseUpdate: (angles: PoseAngles, feedback: FormFeedback, state: PushupState) => void;
  onDownTriggered: () => void;
}

/**
 * Controls how forgiving the rep-counting state machine is.
 * - 'strict':   tight thresholds, near-full lockout/depth required
 * - 'normal':   moderate tolerance, good default for most users
 * - 'beginner': wide tolerance, forgiving depth/lockout/visibility requirements
 */
export type FormStrictness = 'strict' | 'normal' | 'beginner';

function median(values: number[]): number {
  if (values.length === 0) return 180;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

interface StrictnessConfig {
  lockoutThreshold: number;       // elbow angle considered "arms extended" - gates entering READY at the start
  descentStartThreshold: number;  // elbow angle considered "starting to bend"
  depthTolerance: number;         // extra degrees allowed past targetDepthAngle to count as "down"
  ascentThreshold: number;        // elbow angle considered "pushing back up"
  minVisibility: number;          // minimum landmark visibility score to allow state transitions
  minRepDurationMs: number;       // minimum time a rep must take to be valid (rejects glitches)
  minRepGapMs: number;            // minimum time between two counted reps
  repCompletionTolerance: number; // degrees of slack BELOW lockoutThreshold that still counts as "reached the top" when finishing a rep
}

const STRICTNESS_PRESETS: Record<FormStrictness, StrictnessConfig> = {
  strict: {
    lockoutThreshold: 155,
    descentStartThreshold: 135,
    depthTolerance: 4,
    ascentThreshold: 115,
    minVisibility: 0.5,
    minRepDurationMs: 450,
    minRepGapMs: 350,
    repCompletionTolerance: 0,
  },
  normal: {
    lockoutThreshold: 150,
    descentStartThreshold: 140,
    depthTolerance: 12,
    ascentThreshold: 122,
    minVisibility: 0.35,
    minRepDurationMs: 280,
    minRepGapMs: 180,
    repCompletionTolerance: 12,
  },
  beginner: {
    lockoutThreshold: 142,
    descentStartThreshold: 145,
    depthTolerance: 20,
    ascentThreshold: 128,
    minVisibility: 0.25,
    minRepDurationMs: 180,
    minRepGapMs: 100,
    repCompletionTolerance: 20,
  },
};

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

  private strictness: FormStrictness;
  private config: StrictnessConfig;
  private plankToleranceOverride: Partial<PlankToleranceOptions> = {};

  // Rolling median buffer for the elbow angle. Absorbs single-frame noise
  // that would otherwise cause a threshold crossing to be missed or falsely
  // fired - one of the main causes of inconsistent counting.
  private recentElbowAngles: number[] = [];
  private readonly ANGLE_SMOOTHING_WINDOW = 3;

  // Plank position is only checked when *starting* a rep (IDLE -> READY).
  // It is intentionally NOT re-checked every frame during an active rep:
  // your shoulder/hip landmarks naturally shift a bit in the 2D image as
  // your body moves during a real pushup, which would otherwise cause the
  // safety check meant to catch "waving while standing" to also abort
  // legitimate reps mid-motion. Requiring it only at the entry gate still
  // fully blocks the standing/waving case (you can never reach READY).
  private plankLostSince: number | null = null;
  private plankConfirmedSince: number | null = null;
  private readonly PLANK_CONFIRM_MS = 120; // how long plank must hold before we trust it, at the entry gate

  // Safety net: if a rep gets stuck mid-motion for too long (tracking
  // glitch, camera dropout), reset to IDLE instead of staying wedged
  // forever unable to count further reps.
  private lastStateChangeTimestamp = Date.now();
  private readonly STALL_TIMEOUT_MS = 6000;

  constructor(
    callbacks: PushupEngineCallbacks,
    targetDepthAngle: number = 90,
    strictness: FormStrictness = 'normal'
  ) {
    this.callbacks = callbacks;
    this.targetDepthAngle = targetDepthAngle;
    this.strictness = strictness;
    this.config = STRICTNESS_PRESETS[strictness];
  }

  public setTargetDepth(angle: number) {
    this.targetDepthAngle = angle;
  }

  /** Change how forgiving rep counting is at runtime (e.g. from a settings toggle). */
  public setStrictness(strictness: FormStrictness) {
    this.strictness = strictness;
    this.config = STRICTNESS_PRESETS[strictness];
  }

  public getStrictness(): FormStrictness {
    return this.strictness;
  }

  /**
   * Override plank-detection tolerance at runtime - useful if a user's
   * camera isn't positioned side-on and the entry gate is too strict.
   */
  public setPlankTolerance(overrides: Partial<PlankToleranceOptions>) {
    this.plankToleranceOverride = { ...this.plankToleranceOverride, ...overrides };
  }

  /**
   * Manually calibrate depth requirement from a user's observed range of
   * motion (e.g. after a warmup rep), for users who can't reach the
   * default target depth.
   */
  public calibrateFromObservedMinAngle(observedMinAngle: number, paddingDegrees: number = 8) {
    this.targetDepthAngle = Math.max(60, Math.round(observedMinAngle + paddingDegrees));
  }

  private setState(next: PushupState) {
    this.state = next;
    this.lastStateChangeTimestamp = Date.now();
    this.callbacks.onStateChange(this.state);
  }

  public resetRepCount() {
    this.repCount = 0;
    this.currentSetReps = 0;
    this.minAngleReachedInRep = 180;
    this.repFormScores = [];
    this.plankLostSince = null;
    this.plankConfirmedSince = null;
    this.recentElbowAngles = [];
    this.setState('IDLE');
  }

  public startNewSet() {
    this.currentSetReps = 0;
    this.minAngleReachedInRep = 180;
    this.plankLostSince = null;
    this.plankConfirmedSince = null;
    this.recentElbowAngles = [];
    this.setState('IDLE');
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

    const { angles, feedback } = analyzePushupPose(
      smoothed,
      this.targetDepthAngle,
      Object.keys(this.plankToleranceOverride).length
        ? ({ ...DEFAULT_PLANK_TOLERANCE, ...this.plankToleranceOverride } as PlankToleranceOptions)
        : undefined
    );

    const now = Date.now();
    const cfg = this.config;

    // Smooth the elbow angle with a short rolling median.
    this.recentElbowAngles.push(angles.activeElbowAngle);
    if (this.recentElbowAngles.length > this.ANGLE_SMOOTHING_WINDOW) {
      this.recentElbowAngles.shift();
    }
    const elbowAngle = median(this.recentElbowAngles);

    // Track minimum angle reached during current rep descent
    if (this.state === 'DESCENDING' || this.state === 'DOWN') {
      if (elbowAngle < this.minAngleReachedInRep) {
        this.minAngleReachedInRep = elbowAngle;
      }
    }

    // Stall safety net: if we've been mid-rep for too long without
    // progressing, something's wrong with tracking - bail out to IDLE
    // rather than staying stuck forever.
    const midRepStates: PushupState[] = ['DESCENDING', 'DOWN', 'ASCENDING'];
    if (midRepStates.includes(this.state) && now - this.lastStateChangeTimestamp > this.STALL_TIMEOUT_MS) {
      this.minAngleReachedInRep = 180;
      this.setState('IDLE');
      this.callbacks.onPoseUpdate(angles, feedback, this.state);
      return;
    }

    const LOCKOUT_THRESHOLD = cfg.lockoutThreshold;
    const DESCENT_START_THRESHOLD = cfg.descentStartThreshold;
    const BOTTOM_DEPTH_THRESHOLD = this.targetDepthAngle + cfg.depthTolerance;
    const ASCENT_THRESHOLD = cfg.ascentThreshold;
    const MIN_VISIBILITY = cfg.minVisibility;
    // Looser threshold just for finishing/counting the rep - reaching the
    // exact same lockoutThreshold every single rep is unrealistic.
    const REP_COMPLETION_THRESHOLD = LOCKOUT_THRESHOLD - cfg.repCompletionTolerance;

    const lowVisibility = angles.visibilityScore <= MIN_VISIBILITY;

    // Plank-position confirmation, used ONLY at the IDLE -> READY entry gate.
    const rawNotInPlank = !angles.isPlankPosition;
    if (rawNotInPlank) {
      if (this.plankLostSince === null) this.plankLostSince = now;
      this.plankConfirmedSince = null;
    } else {
      if (this.plankConfirmedSince === null) this.plankConfirmedSince = now;
      this.plankLostSince = null;
    }
    const plankConfirmed =
      !rawNotInPlank &&
      this.plankConfirmedSince !== null &&
      now - this.plankConfirmedSince >= this.PLANK_CONFIRM_MS;

    switch (this.state) {
      case 'IDLE':
        // Entry gate: must be in a confirmed plank with arms extended.
        // This is the only place plank position is checked - it fully
        // blocks "wave your arm while standing" (you can't get past here),
        // without re-litigating it every frame during a real rep.
        if (elbowAngle >= LOCKOUT_THRESHOLD && !lowVisibility && plankConfirmed) {
          this.setState('READY');
        }
        break;

      case 'READY':
        if (elbowAngle < DESCENT_START_THRESHOLD && !lowVisibility) {
          this.repStartTimestamp = now;
          this.minAngleReachedInRep = elbowAngle;
          this.setState('DESCENDING');
        }
        break;

      case 'DESCENDING':
        if (elbowAngle <= BOTTOM_DEPTH_THRESHOLD) {
          this.lastBottomTimestamp = now;
          soundManager.playDownCue();
          this.callbacks.onDownTriggered();
          this.setState('DOWN');
        } else if (elbowAngle >= REP_COMPLETION_THRESHOLD) {
          // Aborted descent without going down
          this.setState('READY');
        }
        break;

      case 'DOWN':
        if (elbowAngle > ASCENT_THRESHOLD) {
          this.setState('ASCENDING');
        }
        break;

      case 'ASCENDING':
        // Uses REP_COMPLETION_THRESHOLD (looser than LOCKOUT_THRESHOLD) so
        // reps still count even without identical elbow extension every time.
        if (elbowAngle >= REP_COMPLETION_THRESHOLD) {
          const repDuration = now - this.repStartTimestamp;
          const timeSinceLastRep = now - this.lastRepTimestamp;

          if (repDuration >= cfg.minRepDurationMs && timeSinceLastRep > cfg.minRepGapMs) {
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
          }

          this.setState('UP');
          setTimeout(() => {
            if (this.state === 'UP') {
              this.minAngleReachedInRep = 180;
              this.setState('READY');
            }
          }, 150);
        } else if (elbowAngle <= BOTTOM_DEPTH_THRESHOLD) {
          // Dipped back down
          this.setState('DOWN');
        }
        break;

      case 'UP':
        if (elbowAngle < DESCENT_START_THRESHOLD) {
          this.repStartTimestamp = now;
          this.minAngleReachedInRep = elbowAngle;
          this.setState('DESCENDING');
        }
        break;
    }

    this.callbacks.onPoseUpdate(angles, feedback, this.state);
  }

  private lastBottomTimestamp = 0;

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

  const connections: [number, number][] = [
    [11, 12],
    [11, 13], [13, 15],
    [12, 14], [14, 16],
    [11, 23], [12, 24],
    [23, 24],
    [23, 25], [25, 27],
    [24, 26], [26, 28],
  ];

  let strokeColor = '#f97316';
  if (!feedback.isValidPlank) {
    strokeColor = '#ef4444';
  } else if (state === 'DOWN' || feedback.isGoodDepth) {
    strokeColor = '#22c55e';
  } else if (state === 'DESCENDING') {
    strokeColor = '#f97316';
  } else if (state === 'READY') {
    strokeColor = '#38bdf8';
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

  landmarks.forEach((p, idx) => {
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