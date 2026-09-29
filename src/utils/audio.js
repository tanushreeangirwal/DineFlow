// Gentle hospitality notification chime using Web Audio API (zero external assets needed)
export function playNotificationChime() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();

    const now = ctx.currentTime;
    // Pleasant two-tone chime (F5 -> A5 -> C6)
    const tones = [
      { freq: 698.46, start: 0, duration: 0.25 },
      { freq: 880.00, start: 0.15, duration: 0.35 },
      { freq: 1046.50, start: 0.30, duration: 0.5 }
    ];

    tones.forEach(t => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(t.freq, now + t.start);

      gain.gain.setValueAtTime(0.001, now + t.start);
      gain.gain.exponentialRampToValueAtTime(0.18, now + t.start + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + t.start + t.duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + t.start);
      osc.stop(now + t.start + t.duration);
    });
  } catch (err) {
    console.warn('Audio chime could not play:', err);
  }
}
