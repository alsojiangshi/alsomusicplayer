import { usePlayer } from '../stores/playerStore';

export default function SeekSlider() {
  const { position, duration, seek } = usePlayer();
  const pct = duration > 0 ? (position / duration) * 100 : 0;

  return (
    <input type="range" min={0} max={duration || 1} value={position} onChange={e => seek(+e.target.value)}
      className="flex-1 h-1 bg-bg-light rounded appearance-none cursor-pointer
        [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5
        [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent [&::-webkit-slider-thumb]:hover:bg-accent-hover" />
  );
}
