export function createNotificationSound() {
  let context
  return {
    unlock() {
      try {
        context ||= new (window.AudioContext || window.webkitAudioContext)()
        if (context.state === 'suspended') context.resume()
      } catch {}
    },
    play() {
      if (!context) return
      try {
        const now = context.currentTime
        const oscillator = context.createOscillator()
        const gain = context.createGain()
        oscillator.frequency.setValueAtTime(740, now)
        oscillator.frequency.setValueAtTime(980, now + 0.09)
        gain.gain.setValueAtTime(0.0001, now)
        gain.gain.exponentialRampToValueAtTime(0.12, now + 0.02)
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22)
        oscillator.connect(gain); gain.connect(context.destination)
        oscillator.start(now); oscillator.stop(now + 0.24)
      } catch {}
    },
  }
}
