/**
 * On-device push-up rep counter.
 *
 * Pipeline: camera frame -> pose-detection landmarks (17-point COCO keypoints,
 * from TensorFlow.js MoveNet Lightning, running fully on-device via WebGL) ->
 * joint angles -> a small state machine that only counts a rep once the body
 * has passed through a validated DOWN position and back to a validated UP
 * position, with time and movement thresholds to reject jitter, partial reps,
 * and reps performed with bad form.
 *
 * This file has no DOM/browser dependency so it's unit-testable in isolation.
 */

export type Keypoint = { x: number; y: number; score: number; name: string };

export type Pose = { keypoints: Keypoint[] };

export type RepState = "IDLE" | "UP" | "GOING_DOWN" | "DOWN" | "GOING_UP" | "INVALID_RESET";

export interface FormThresholds {
  /** Elbow angle (deg) below which the body counts as "down". Smaller = deeper required. */
  downElbowAngle: number;
  /** Elbow angle (deg) above which the body counts as "up" / arms extended. */
  upElbowAngle: number;
  /** Max allowed deviation (deg) of the hip-shoulder-ankle line from straight (180deg) before form is flagged. */
  maxBodySag: number;
  /** Minimum keypoint confidence to trust a landmark this frame. */
  minKeypointScore: number;
  /** Minimum ms a rep must take end-to-end — rejects camera glitches counted as reps. */
  minRepDurationMs: number;
  /** Maximum ms allowed between DOWN and UP before we assume the set paused (used for "unbroken" tracking, not rejection). */
  restBreachMs: number;
  /** Consecutive frames required in a state before transitioning (debounce). */
  debounceFrames: number;
}

export const DEFAULT_THRESHOLDS: FormThresholds = {
  downElbowAngle: 95,
  upElbowAngle: 155,
  maxBodySag: 28,
  minKeypointScore: 0.35,
  minRepDurationMs: 500,
  restBreachMs: 3000,
  debounceFrames: 3,
};

export interface RepResult {
  valid: boolean;
  reason?: "TOO_FAST" | "SHALLOW_DEPTH" | "ARMS_NOT_EXTENDED" | "BODY_SAG" | "LOW_CONFIDENCE";
  durationMs: number;
  minElbowAngle: number;
  maxElbowAngle: number;
  formScore: number; // 0-1, composite of depth quality + alignment quality
  timestamp: number;
}

function angleAt(a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }): number {
  // Angle at vertex b, formed by points a-b-c, in degrees.
  const abx = a.x - b.x, aby = a.y - b.y;
  const cbx = c.x - b.x, cby = c.y - b.y;
  const dot = abx * cbx + aby * cby;
  const magAB = Math.hypot(abx, aby);
  const magCB = Math.hypot(cbx, cby);
  if (magAB === 0 || magCB === 0) return 180;
  const cos = Math.min(1, Math.max(-1, dot / (magAB * magCB)));
  return (Math.acos(cos) * 180) / Math.PI;
}

function kp(pose: Pose, name: string): Keypoint | undefined {
  return pose.keypoints.find((k) => k.name === name);
}

export interface FrameMetrics {
  elbowAngle: number; // average of left/right elbow angle
  bodyAlignmentDeviation: number; // deg deviation from a straight shoulder-hip-ankle line (plank alignment)
  confidence: number; // min confidence across the joints we relied on
  usable: boolean;
}

/**
 * Reduce a raw pose to the joint metrics the state machine needs.
 * Uses whichever side (left/right) has higher confidence per-joint, and
 * averages both sides' elbow angle when both are visible — this keeps the
 * counter working whether the camera sees a front-on or 3/4 angle.
 */
export function computeFrameMetrics(pose: Pose, thresholds: FormThresholds): FrameMetrics {
  const names = ["left_shoulder", "right_shoulder", "left_elbow", "right_elbow", "left_wrist", "right_wrist", "left_hip", "right_hip", "left_ankle", "right_ankle"];
  const points: Record<string, Keypoint | undefined> = {};
  for (const n of names) points[n] = kp(pose, n);

  const sides: Array<"left" | "right"> = ["left", "right"];
  const elbowAngles: number[] = [];
  let minConfidence = 1;

  for (const side of sides) {
    const shoulder = points[`${side}_shoulder`];
    const elbow = points[`${side}_elbow`];
    const wrist = points[`${side}_wrist`];
    if (shoulder && elbow && wrist && shoulder.score >= thresholds.minKeypointScore && elbow.score >= thresholds.minKeypointScore && wrist.score >= thresholds.minKeypointScore) {
      elbowAngles.push(angleAt(shoulder, elbow, wrist));
      minConfidence = Math.min(minConfidence, shoulder.score, elbow.score, wrist.score);
    }
  }

  // Body alignment: angle at the hip formed by shoulder-hip-ankle. 180deg = perfectly straight plank.
  const alignmentDeviations: number[] = [];
  for (const side of sides) {
    const shoulder = points[`${side}_shoulder`];
    const hip = points[`${side}_hip`];
    const ankle = points[`${side}_ankle`];
    if (shoulder && hip && ankle && shoulder.score >= thresholds.minKeypointScore && hip.score >= thresholds.minKeypointScore && ankle.score >= thresholds.minKeypointScore) {
      const angle = angleAt(shoulder, hip, ankle);
      alignmentDeviations.push(Math.abs(180 - angle));
      minConfidence = Math.min(minConfidence, shoulder.score, hip.score, ankle.score);
    }
  }

  const usable = elbowAngles.length > 0;
  return {
    elbowAngle: usable ? elbowAngles.reduce((a, b) => a + b, 0) / elbowAngles.length : 180,
    bodyAlignmentDeviation: alignmentDeviations.length ? Math.min(...alignmentDeviations) : 0,
    confidence: usable ? minConfidence : 0,
    usable,
  };
}

/**
 * Finite state machine that turns a stream of frame metrics into validated reps.
 * States: IDLE -> UP -> GOING_DOWN -> DOWN -> GOING_UP -> UP (rep +1) -> ...
 * A rep only counts when the machine actually bottoms out at DOWN (elbow angle
 * below downElbowAngle) *and* returns to UP (arms extended) without the body
 * alignment ever sagging past maxBodySag while in the down phase, and without
 * completing faster than minRepDurationMs (rejects sensor noise / fake reps).
 */
export class PushupStateMachine {
  private state: RepState = "IDLE";
  private thresholds: FormThresholds;
  private framesInState = 0;
  private downEnteredAt = 0;
  private repStartedAt = 0;
  private minElbowAngleThisRep = 180;
  private maxElbowAngleThisRep = 0;
  private worstAlignmentThisRep = 0;
  private lowConfidenceStreak = 0;

  public validRepCount = 0;
  public rejectedRepCount = 0;
  public lastRestGapMs = 0;
  private lastValidRepAt = 0;

  constructor(thresholds: Partial<FormThresholds> = {}) {
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...thresholds };
  }

  reset() {
    this.state = "IDLE";
    this.framesInState = 0;
    this.minElbowAngleThisRep = 180;
    this.maxElbowAngleThisRep = 0;
    this.worstAlignmentThisRep = 0;
  }

  /** Feed one frame's metrics in. Returns a RepResult when a rep attempt just resolved (valid or invalid), else null. */
  process(metrics: FrameMetrics, now: number): RepResult | null {
    if (!metrics.usable || metrics.confidence < this.thresholds.minKeypointScore) {
      this.lowConfidenceStreak++;
      // Sustained tracking loss resets the in-progress rep so we don't count a phantom.
      if (this.lowConfidenceStreak > 15 && this.state !== "IDLE" && this.state !== "UP") {
        this.state = "IDLE";
      }
      return null;
    }
    this.lowConfidenceStreak = 0;

    const { elbowAngle, bodyAlignmentDeviation } = metrics;
    const { downElbowAngle, upElbowAngle, maxBodySag, debounceFrames, minRepDurationMs } = this.thresholds;

    const isDownPose = elbowAngle <= downElbowAngle;
    const isUpPose = elbowAngle >= upElbowAngle;

    let result: RepResult | null = null;

    switch (this.state) {
      case "IDLE":
        if (isUpPose) {
          this.transition("UP");
        }
        break;

      case "UP":
        this.framesInState++;
        if (elbowAngle < upElbowAngle - 5) {
          // started descending
          this.transition("GOING_DOWN");
          this.repStartedAt = now;
          this.minElbowAngleThisRep = elbowAngle;
          this.maxElbowAngleThisRep = elbowAngle;
          this.worstAlignmentThisRep = bodyAlignmentDeviation;
        }
        break;

      case "GOING_DOWN":
        this.minElbowAngleThisRep = Math.min(this.minElbowAngleThisRep, elbowAngle);
        this.worstAlignmentThisRep = Math.max(this.worstAlignmentThisRep, bodyAlignmentDeviation);
        if (isDownPose) {
          this.framesInState++;
          if (this.framesInState >= debounceFrames) {
            this.transition("DOWN");
            this.downEnteredAt = now;
          }
        } else {
          this.framesInState = 0;
          if (isUpPose) this.transition("UP"); // bounced back up without reaching depth — abandon
        }
        break;

      case "DOWN":
        this.minElbowAngleThisRep = Math.min(this.minElbowAngleThisRep, elbowAngle);
        this.worstAlignmentThisRep = Math.max(this.worstAlignmentThisRep, bodyAlignmentDeviation);
        if (elbowAngle > downElbowAngle + 5) {
          this.transition("GOING_UP");
        }
        break;

      case "GOING_UP":
        this.maxElbowAngleThisRep = Math.max(this.maxElbowAngleThisRep, elbowAngle);
        this.worstAlignmentThisRep = Math.max(this.worstAlignmentThisRep, bodyAlignmentDeviation);
        if (isUpPose) {
          this.framesInState++;
          if (this.framesInState >= debounceFrames) {
            result = this.finalizeRep(now);
            this.transition("UP");
          }
        } else {
          this.framesInState = 0;
          if (isDownPose) this.transition("DOWN"); // dipped back down — keep waiting
        }
        break;
    }

    return result;
  }

  private transition(next: RepState) {
    this.state = next;
    this.framesInState = 0;
  }

  private finalizeRep(now: number): RepResult {
    const durationMs = now - this.repStartedAt;
    const { minRepDurationMs, maxBodySag } = this.thresholds;

    let reason: RepResult["reason"] | undefined;
    if (durationMs < minRepDurationMs) reason = "TOO_FAST";
    else if (this.minElbowAngleThisRep > this.thresholds.downElbowAngle) reason = "SHALLOW_DEPTH";
    else if (this.maxElbowAngleThisRep < this.thresholds.upElbowAngle) reason = "ARMS_NOT_EXTENDED";
    else if (this.worstAlignmentThisRep > maxBodySag) reason = "BODY_SAG";

    const valid = !reason;

    // Composite form score: how deep + how straight, normalized 0-1.
    const depthQuality = Math.max(0, Math.min(1, (this.thresholds.downElbowAngle + 15 - this.minElbowAngleThisRep) / 40));
    const alignmentQuality = Math.max(0, Math.min(1, 1 - this.worstAlignmentThisRep / (maxBodySag * 1.5)));
    const formScore = valid ? Math.round(((depthQuality + alignmentQuality) / 2) * 100) / 100 : 0;

    if (valid) {
      this.validRepCount++;
      this.lastRestGapMs = this.lastValidRepAt ? now - this.lastValidRepAt : 0;
      this.lastValidRepAt = now;
    } else {
      this.rejectedRepCount++;
    }

    return {
      valid,
      reason,
      durationMs,
      minElbowAngle: Math.round(this.minElbowAngleThisRep),
      maxElbowAngle: Math.round(this.maxElbowAngleThisRep),
      formScore,
      timestamp: now,
    };
  }

  getState() {
    return this.state;
  }

  getThresholds(): FormThresholds {
    return this.thresholds;
  }
}
