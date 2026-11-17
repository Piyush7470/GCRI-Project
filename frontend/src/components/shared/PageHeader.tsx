import React from "react";

type PageHeaderProps = {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Right-side actions (buttons, filters) */
  actions?: React.ReactNode;
  className?: string;
  large?: boolean;
};

/**
 * Consistent page hero: title, optional subtitle, and actions row.
 */
export function PageHeader({
  title,
  subtitle,
  actions,
  className = "",
  large = true,
}: PageHeaderProps) {
  return (
    <header className={`page-header ${className}`.trim()}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <h1 className={`page-title font-editorial ${large ? "page-title-lg" : ""}`}>
            {title}
          </h1>
          {subtitle ? <p className="page-subtitle mt-1.5">{subtitle}</p> : null}
        </div>
        {actions ? (
          <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>
        ) : null}
      </div>
    </header>
  );
}