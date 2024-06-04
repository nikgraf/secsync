export type LogoProps = {
  color?: string;
  height?: number;
  hoverEffect?: boolean;
};

import LogoSvg from "../public/secsync-logo.svg";

export const Logo = ({ color = "currentColor", height = 20 }: LogoProps) => {
  return (
    <div className="relative" style={{ height: height }}>
      <LogoSvg width={160} />
    </div>
  );
};
