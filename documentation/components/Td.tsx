import cn from "clsx";
import type { ComponentProps } from "react";

export const Td = ({ className = "", ...props }: ComponentProps<"td">) => (
  <td
    className={cn(
      "nx-m-0 py-3 px-4 border-b border-gray-200 dark:border-surface-border",
      className
    )}
    {...props}
  />
);
