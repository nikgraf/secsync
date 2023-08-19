import cn from "clsx";
import type { ComponentProps } from "react";

export const Th = ({ className = "", ...props }: ComponentProps<"th">) => (
  <th
    className={cn(
      "nx-m-0 py-3 px-4 nx-font-semibold text-left bg-gray-150 border-gray-200",
      "dark:bg-surface-tertiary dark:border-surface-border",
      className
    )}
    {...props}
  />
);
