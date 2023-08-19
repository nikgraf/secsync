import cn from "clsx";
import type { ComponentProps, ReactElement } from "react";

export const Code = ({
  children,
  className,
  ...props
}: ComponentProps<"code">): ReactElement => {
  const hasLineNumbers = "data-line-numbers" in props;
  return (
    <code
      className={cn(
        "bg-gray-150 px-1.5 py-0.5 rounded text-gray-800 text-[0.9em] nx-break-words",
        "dark:bg-gray-800/50 dark:text-gray-400",
        hasLineNumbers && "[counter-reset:line]",
        className
      )}
      // always show code blocks in ltr
      dir="ltr"
      {...props}
    >
      {children}
    </code>
  );
};
