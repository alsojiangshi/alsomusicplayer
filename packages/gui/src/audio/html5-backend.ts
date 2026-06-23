import type { AudioBackend } from '../../../core/src/index.js';

export function createHtml5Backend(audioEl: HTMLAudioElement): AudioBackend {
  return {
    get state() { return audioEl.paused ? (audioEl.currentTime === 0 ? 'stopped' : 'paused') : 'playing'; } as any,
    get volume() { return Math.round(audioEl.volume * 100); },
    async load(src: string) { audioEl.src = src; },
    play() { audioEl.play(); },
    pause() { audioEl.pause(); },
    stop() { audioEl.pause(); audioEl.currentTime = 0; },
    seek(ms: number) { audioEl.currentTime = ms / 1000; },
    setVolume(v: number) { audioEl.volume = v / 100; },
    getPosition() { return Math.floor(audioEl.currentTime * 1000); },
    getDuration() { return Math.floor(audioEl.duration * 1000) || 0; },
    getProgress() { return audioEl.duration ? audioEl.currentTime / audioEl.duration : 0; },
    playPause() { audioEl.paused ? audioEl.play() : audioEl.pause(); },
    volumeUp(s = 5) { audioEl.volume = Math.min(1, audioEl.volume + s / 100); },
    volumeDown(s = 5) { audioEl.volume = Math.max(0, audioEl.volume - s / 100); },
    toggleMute() { audioEl.muted = !audioEl.muted; return audioEl.muted; },
    on(event: string, cb: (...args: any[]) => void) {
      if (event === 'trackEnd') audioEl.addEventListener('ended', cb as any);
    },
  };
}
