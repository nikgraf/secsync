import cn from "clsx";
import type { ReactElement } from "react";

export function Footer({ menu }: { menu?: boolean }): ReactElement {
  return (
    <footer className="bg-gray-100 nx-pb-[env(safe-area-inset-bottom)] dark:bg-surface-primary print:nx-bg-transparent border-t border-gray-200 dark:border-surface-border">
      <div
        className={cn(
          "nx-mx-auto nx-flex nx-max-w-[90rem] nx-justify-center nx-py-12 nx-text-gray-600 dark:nx-text-gray-400 md:nx-justify-start",
          "nx-pl-[max(env(safe-area-inset-left),1.5rem)] nx-pr-[max(env(safe-area-inset-right),1.5rem)]"
        )}
      >
        <div className="footer-wrapper">
          <div className="flex-1 justify-between text-sm">
            <div className="w-52">TODO add NLNet Link</div>
          </div>
          <div className="footer-links">
            <h6>Resources</h6>
            <a href="/docs">Documentation</a>
            <a href="/blog">Blog</a>
            <a href="https://github.com/serenity-kit/secsync" target="_blank">
              Github
            </a>
          </div>
          <div className="footer-links">
            <h6>Company</h6>
            <a href="https://github.com/serenity-kit/" target="_blank">
              Serenity
            </a>
            <a href="/imprint">Imprint</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
