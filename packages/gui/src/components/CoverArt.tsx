interface Props { size?: number; }

export default function CoverArt({ size = 48 }: Props) {
  return (
    <div className="rounded-lg bg-bg-medium border border-border flex items-center justify-center flex-shrink-0"
      style={{ width: size, height: size }}>
      <span className="text-2xl">🎵</span>
    </div>
  );
}
