import cn from "clsx";
import type { ComponentProps, ReactElement } from "react";
import { useRef } from "react";

export const Pre = ({
  children,
  className,
  hasCopyCode,
  filename,
  ...props
}: ComponentProps<"pre"> & {
  filename?: string;
  hasCopyCode?: boolean;
}): ReactElement => {
  const preRef = useRef<HTMLPreElement | null>(null);
  const subpixel = false;

  return (
    <div className={`nextra-code-block nx-relative nx-mt-5 first:nx-mt-0`}>
      {filename && (
        <div className="nx-absolute nx-top-0 nx-z-[1] nx-w-full nx-truncate nx-rounded-t-xl nx-bg-primary-700/5 nx-py-2 nx-px-4 nx-text-xs nx-text-gray-700 dark:nx-bg-primary-300/10 dark:nx-text-gray-200">
          {filename}
        </div>
      )}
      <pre
        className={cn(
          "nx-mb-4 nx-overflow-x-auto nx-font-medium ",
          filename ? "nx-pt-12 nx-pb-4" : "nx-py-4",
          `rounded bg-gray-120 dark:bg-surface-secondary border-[0.5px] border-gray-200 dark:border-surface-border ${
            subpixel && "nx-subpixel-antialiased"
          }`,
          "contrast-more:nx-border contrast-more:nx-border-primary-900/20 contrast-more:nx-contrast-150 contrast-more:dark:nx-border-primary-100/40",
          className
        )}
        ref={preRef}
        {...props}
      >
        {children}
      </pre>
      <div
        className={cn(
          "nx-opacity-0 nx-transition [div:hover>&]:nx-opacity-100 focus-within:nx-opacity-100",
          "nx-flex nx-gap-1 nx-absolute nx-m-[11px] nx-right-0",
          filename ? "nx-top-8" : "nx-top-0"
        )}
      ></div>
    </div>
  );
};
