export type LogoProps = {
  color?: string;
  height?: number;
  hoverEffect?: boolean;
};

export const Logo = ({ color = "currentColor", height = 20 }: LogoProps) => {
  return (
    <div className="relative" style={{ height: height }}>
      Secsync
    </div>
  );
};
