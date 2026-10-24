type AudioWindow = Window & { webkitAudioContext?: typeof AudioContext };

const TONES = [660, 880];
const STEP = 0.18;
let context: AudioContext | null = null;

export function chime(): void {
  const Context = window.AudioContext ?? (window as AudioWindow).webkitAudioContext;
  if (!Context) return;
  const audio = (context ??= new Context());
  void audio.resume();
  TONES.forEach((hz, i) => {
    const start = audio.currentTime + i * STEP;
    const tone = audio.createOscillator();
    const gain = audio.createGain();
    tone.frequency.value = hz;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.2, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + STEP - 0.02);
    tone.connect(gain).connect(audio.destination);
    tone.start(start);
    tone.stop(start + STEP);
  });
}
