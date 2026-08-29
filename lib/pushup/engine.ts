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
 * - 'strict':   original tight thresholds (near-perfect form required)
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
  lockoutThreshold: number;      // elbow angle considered "arms extended" (used to enter READY stance)
  descentStartThreshold: number; // elbow angle considered "starting to bend"
  depthTolerance: number;        // extra degrees allowed past targetDepthAngle to count as "down"
  ascentThreshold: number;       // elbow angle considered "pushing back up"
  minVisibility: number;         // minimum landmark visibility score to allow state transitions
  minRepDurationMs: number;      // minimum time a rep must take to be valid (rejects glitches)
  minRepGapMs: number;           // minimum time between two counted reps
  repCompletionTolerance: number; // degrees of slack BELOW lockoutThreshold that still counts as "reached the top" for rep counting
}

const STRICTNESS_PRESETS: Record<FormStrictness, StrictnessConfig> = {
  strict: {
    lockoutThreshold: 155,
    descentStartThreshold: 135,
    depthTolerance: 4,
    ascentThreshold: 115,
    minVisibility: 0.5,
    minRepDurationMs: 500,
    minRepGapMs: 400,
    repCompletionTolerance: 0,
  },
  normal: {
    lockoutThreshold: 150,
    descentStartThreshold: 140,
    depthTolerance: 10,
    ascentThreshold: 120,
    minVisibility: 0.4,
    minRepDurationMs: 300,
    minRepGapMs: 200,
    repCompletionTolerance: 10,
  },
  beginner: {
    lockoutThreshold: 145,
    descentStartThreshold: 145,
    depthTolerance: 18,
    ascentThreshold: 125,
    minVisibility: 0.3,
    minRepDurationMs: 200,
    minRepGapMs: 120,
    repCompletionTolerance: 18,
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

  // Configurable leniency
  private strictness: FormStrictness;
  private config: StrictnessConfig;

  // Plank-position hysteresis: avoids resetting the whole rep on a single
  // noisy/jittery frame, or on a camera angle that occasionally reads
  // borderline. We only act once the state has been consistent for a
  // short window of time.
  private plankLostSince: number | null = null;
  private plankConfirmedSince: number | null = null;
  private readonly PLANK_LOST_GRACE_MS = 600; // how long plank must be "lost" before we abort a rep
  private readonly PLANK_CONFIRM_MS = 100;    // how long plank must hold before we trust it
  private plankToleranceOverride: Partial<PlankToleranceOptions> = {};

  // Rolling buffer of recent elbow-angle readings, used to smooth out
  // single-frame noise/spikes right at a threshold boundary. This is on
  // top of the landmark-level EMA smoothing - it specifically protects
  // against a single bad frame causing a threshold crossing to be missed
  // or falsely triggered.
  private recentElbowAngles: number[] = [];
  private readonly ANGLE_SMOOTHING_WINDOW = 3;

  // State machine timing guards
  private timeInBottomStateMs = 0;
  private lastBottomTimestamp = 0;

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

  /**
   * Change how forgiving rep counting is at runtime (e.g. from a settings toggle).
   */
  public setStrictness(strictness: FormStrictness) {
    this.strictness = strictness;
    this.config = STRICTNESS_PRESETS[strictness];
  }

  public getStrictness(): FormStrictness {
    return this.strictness;
  }

  /**
   * Override the plank-detection tolerance at runtime - most useful for
   * loosening maxTorsoTiltDegrees if a user's camera isn't positioned
   * side-on and real reps are being rejected as "not in plank position".
   */
  public setPlankTolerance(overrides: Partial<PlankToleranceOptions>) {
    this.plankToleranceOverride = { ...this.plankToleranceOverride, ...overrides };
  }

  /**
   * Auto-calibrate depth requirement from a user's observed range of motion.
   * Call this after a few warmup reps to set a personalized bottom threshold
   * for users who physically can't reach the default target depth.
   */
  public calibrateFromObservedMinAngle(observedMinAngle: number, paddingDegrees: number = 8) {
    this.targetDepthAngle = Math.max(60, Math.round(observedMinAngle + paddingDegrees));
  }

  public resetRepCount() {
    this.repCount = 0;
    this.currentSetReps = 0;
    this.state = 'IDLE';
    this.minAngleReachedInRep = 180;
    this.repFormScores = [];
    this.plankLostSince = null;
    this.plankConfirmedSince = null;
    this.recentElbowAngles = [];
    this.callbacks.onStateChange(this.state);
  }

  public startNewSet() {
    this.currentSetReps = 0;
    this.state = 'IDLE';
    this.minAngleReachedInRep = 180;
    this.plankLostSince = null;
    this.plankConfirmedSince = null;
    this.recentElbowAngles = [];
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

    const { angles, feedback } = analyzePushupPose(
      smoothed,
      this.targetDepthAngle,
      Object.keys(this.plankToleranceOverride).length
        ? ({ ...DEFAULT_PLANK_TOLERANCE, ...this.plankToleranceOverride } as PlankToleranceOptions)
        : undefined
    );
    const now = Date.now();
    const cfg = this.config;

    // Smooth the elbow angle with a short rolling median. This absorbs
    // single-frame noise (a momentary bad landmark read) that would
    // otherwise cause a threshold crossing to be missed or falsely fired -
    // one of the main causes of inconsistent rep counting.
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

    // STATE MACHINE TRANSITIONS (thresholds driven by strictness config)
    const LOCKOUT_THRESHOLD = cfg.lockoutThreshold;
    const DESCENT_START_THRESHOLD = cfg.descentStartThreshold;
    const BOTTOM_DEPTH_THRESHOLD = this.targetDepthAngle + cfg.depthTolerance;
    const ASCENT_THRESHOLD = cfg.ascentThreshold;
    const MIN_VISIBILITY = cfg.minVisibility;
    // Separate, more forgiving threshold just for actually counting the rep.
    // Reaching full lockoutThreshold every single rep is unrealistic
    // (fatigue, form drift), so completion only needs to get close.
    const REP_COMPLETION_THRESHOLD = LOCKOUT_THRESHOLD - cfg.repCompletionTolerance;

    // If visibility drops momentarily (tracking blip), hold the current state
    // instead of forcing a reset back through IDLE/READY. Only IDLE/READY entry
    // requires good visibility; once a rep is in progress we ride through blips.
    const lowVisibility = angles.visibilityScore <= MIN_VISIBILITY;

    // Body must actually be in a horizontal plank position to count anything.
    // Without this, elbow-angle-only tracking can't tell the difference between
    // "bending your arm during a pushup" and "bending your arm while standing
    // and waving" - both swing the elbow angle through the same range.
    //
    // Hysteresis is applied on both sides so a single noisy frame (jitter,
    // brief occlusion, an off-axis camera reading borderline) doesn't
    // wrongly abort a rep or block starting one:
    //  - plank must read "lost" continuously for PLANK_LOST_GRACE_MS before
    //    we actually abort an in-progress rep
    //  - plank must read "confirmed" continuously for PLANK_CONFIRM_MS
    //    before we trust it to start a rep
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

    const plankLostConfirmed =
      rawNotInPlank &&
      this.plankLostSince !== null &&
      now - this.plankLostSince >= this.PLANK_LOST_GRACE_MS;

    // If the person clearly leaves plank position for a sustained period
    // (e.g. stands up), abandon whatever rep was in progress and go back to
    // IDLE rather than letting a standing arm-wave complete/count a rep.
    if (plankLostConfirmed && this.state !== 'IDLE') {
      this.state = 'IDLE';
      this.minAngleReachedInRep = 180;
      this.callbacks.onStateChange(this.state);
      this.callbacks.onPoseUpdate(angles, feedback, this.state);
      return;
    }

    switch (this.state) {
      case 'IDLE':
        // Wait until user enters a proper plank with arms extended
        if (elbowAngle >= LOCKOUT_THRESHOLD && !lowVisibility && plankConfirmed) {
          this.state = 'READY';
          this.callbacks.onStateChange(this.state);
        }
        break;

      case 'READY':
        // Start descending
        if (elbowAngle < DESCENT_START_THRESHOLD && !lowVisibility) {
          this.state = 'DESCENDING';
          this.repStartTimestamp = now;
          this.minAngleReachedInRep = elbowAngle;
          this.callbacks.onStateChange(this.state);
        }
        break;

      case 'DESCENDING':
        // Reached target depth (within tolerance)!
        if (elbowAngle <= BOTTOM_DEPTH_THRESHOLD) {
          this.state = 'DOWN';
          this.lastBottomTimestamp = now;
          soundManager.playDownCue();
          this.callbacks.onDownTriggered();
          this.callbacks.onStateChange(this.state);
        } else if (elbowAngle >= REP_COMPLETION_THRESHOLD) {
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
        // Reached (near-)full lockout at top -> VALID REP COUNT!
        // Uses REP_COMPLETION_THRESHOLD (looser than LOCKOUT_THRESHOLD) so
        // reps still count even if the person doesn't hit identical elbow
        // extension every single time.
        if (elbowAngle >= REP_COMPLETION_THRESHOLD) {
          const repDuration = now - this.repStartTimestamp;
          const timeSinceLastRep = now - this.lastRepTimestamp;

          // Reject spam/glitch reps
          if (repDuration >= cfg.minRepDurationMs && timeSinceLastRep > cfg.minRepGapMs) {
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
