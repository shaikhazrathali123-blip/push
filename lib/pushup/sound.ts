/**
 * Small Web Audio beep generator for rep-count and depth cues.
 * No external audio files needed, and it's a no-op on the server
 * or in browsers without Web Audio support.
 */
class SoundManager {
  private ctx: AudioContext | null = null;
  private enabled = true;

  private getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return null;
    if (!this.ctx) {
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private beep(frequency: number, durationMs: number, volume: number = 0.15) {
    if (!this.enabled) return;
    const ctx = this.getContext();
    if (!ctx) return;

    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    gain.gain.value = volume;

    oscillator.connect(gain);
    gain.connect(ctx.destination);

    const now = ctx.currentTime;
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + durationMs / 1000);

    oscillator.start(now);
    oscillator.stop(now + durationMs / 1000);
  }

  /** Short low click when the bottom of a rep is reached. */
  playDownCue() {
    this.beep(320, 90, 0.12);
  }

  /** Short high chirp on every counted rep; pitch rises slightly every 10 reps. */
  playRepCount(rep: number) {
    const tier = Math.floor(((rep - 1) % 10));
    const frequency = 660 + tier * 12;
    this.beep(frequency, 120, 0.18);
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
  }
}

export const soundManager = new SoundManager();
