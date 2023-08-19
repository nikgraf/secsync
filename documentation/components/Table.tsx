import cn from "clsx";
import type { ComponentProps } from "react";

export const Table = ({
  className = "",
  ...props
}: ComponentProps<"table">) => (
  <table
    className={cn("my-10 op-table nx-overflow-x-scroll text-sm", className)}
    {...props}
  />
);
