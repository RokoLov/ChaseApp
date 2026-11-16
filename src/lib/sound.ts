/**
 * Alert sounds, made in the browser so there are no sound files to download.
 * Browsers only allow sound after a tap, so `unlockSound` must run from a button first.
 */
export type Sound = 'test' | 'release' | 'warn' | 'shrink' | 'danger' | 'caught' | 'youCaught' | 'reveal' | 'end'

/** Each sound is a short tune: [pitch in hertz, length in seconds]. 0 hertz is a pause. */
const tunes: Record<Sound, [number, number][]> = {
  test: [[660, 0.12], [880, 0.18]],
  release: [[523, 0.15], [659, 0.15], [784, 0.15], [1047, 0.35]],
  warn: [[880, 0.15], [0, 0.08], [880, 0.15]],
  shrink: [[784, 0.18], [587, 0.18], [440, 0.3]],
  danger: [[988, 0.1], [0, 0.05], [988, 0.1], [0, 0.05], [988, 0.1]],
  caught: [[440, 0.15], [330, 0.25]],
  youCaught: [[523, 0.2], [392, 0.2], [262, 0.5]],
  reveal: [[1175, 0.1], [1568, 0.2]],
  end: [[523, 0.18], [659, 0.18], [784, 0.18], [659, 0.18], [1047, 0.5]],
}

/** Vibration patterns for phones that support it (Android). Milliseconds on, off, on… */
const buzz: Partial<Record<Sound, number[]>> = {
  release: [200, 100, 200],
  warn: [150, 80, 150],
  shrink: [300],
  danger: [100, 60, 100, 60, 100],
  youCaught: [500],
  end: [200, 100, 200, 100, 400],
}

let ctx: AudioContext | null = null

export function unlockSound() {
  try {
    // On iPhone this asks for sound to play even when the silent switch is on, where supported.
    const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession
    if (session) session.type = 'playback'
    ctx ??= new AudioContext()
    void ctx.resume()
  } catch {
    ctx = null
  }
}

export function play(sound: Sound) {
  try {
    navigator.vibrate?.(buzz[sound] ?? [])
  } catch {
    // Vibration is not available on this phone.
  }
  if (!ctx) return
  if (ctx.state === 'suspended') void ctx.resume()
  let t = ctx.currentTime + 0.02
  for (const [hz, seconds] of tunes[sound]) {
    if (hz > 0) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'triangle'
      osc.frequency.value = hz
      gain.gain.setValueAtTime(0.0001, t)
      gain.gain.exponentialRampToValueAtTime(0.6, t + 0.015)
      gain.gain.exponentialRampToValueAtTime(0.0001, t + seconds)
      osc.connect(gain).connect(ctx.destination)
      osc.start(t)
      osc.stop(t + seconds + 0.02)
    }
    t += seconds
  }
}
