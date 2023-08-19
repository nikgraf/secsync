import cn from "clsx";
import type { ComponentProps } from "react";

export const Tr = ({ className = "", ...props }: ComponentProps<"tr">) => (
  <tr className={cn("nx-m-0 nx-p-0", className)} {...props} />
);
