// Plays the simulated buzzer through Web Audio (muted until the user turns sound on).
class BuzzerAudio {
  private ctx: AudioContext | null = null;
  private osc: OscillatorNode | null = null;
  private gain: GainNode | null = null;
  enabled = false;
  private freq = 0;

  setEnabled(on: boolean) {
    this.enabled = on;
    if (!on) this.stop();
    else this.setTone(this.freq);
  }
  setTone(freq: number) {
    this.freq = freq;
    if (!this.enabled) return;
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.gain = this.ctx.createGain();
      this.gain.gain.value = 0;
      this.gain.connect(this.ctx.destination);
      this.osc = this.ctx.createOscillator();
      this.osc.type = 'square';
      this.osc.connect(this.gain);
      this.osc.start();
    }
    const t = this.ctx.currentTime;
    if (freq > 0) {
      this.osc!.frequency.setTargetAtTime(Math.min(8000, freq), t, 0.002);
      this.gain!.gain.setTargetAtTime(0.04, t, 0.004);
    } else this.gain!.gain.setTargetAtTime(0, t, 0.004);
  }
  stop() {
    this.freq = 0;
    if (this.gain && this.ctx) this.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.004);
  }
}

export const audio = new BuzzerAudio();
