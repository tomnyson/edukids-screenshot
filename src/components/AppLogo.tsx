import edukidsLogo from '../assets/edukids-logo.png';

type AppLogoProps = {
  className?: string;
  showWordmark?: boolean;
  size?: number;
};

export default function AppLogo({
  className = '',
  showWordmark = false,
  size = 40,
}: AppLogoProps) {
  if (showWordmark) {
    return (
      <div className={`inline-flex items-center gap-3 ${className}`}>
        <img src={edukidsLogo} width={size} height={size} alt="Edukids Logo" className="rounded-lg object-contain" />
        <div className="leading-none">
          <div className="text-white font-semibold tracking-tight">Edukids Screenshot</div>
          <div className="text-[11px] uppercase tracking-[0.24em] text-cyan-300/80">Capture Better</div>
        </div>
      </div>
    );
  }

  return (
    <img
      src={edukidsLogo}
      width={size}
      height={size}
      alt="Edukids Logo"
      className={`rounded-lg object-contain ${className}`}
    />
  );
}
