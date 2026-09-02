import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

interface AdminPageHeaderProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  iconGradient?: string;
  actions?: ReactNode;
  testId?: string;
}

export function AdminPageHeader({
  title,
  description,
  icon: Icon,
  iconGradient = "from-primary to-primary/70",
  actions,
  testId,
}: AdminPageHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 sm:mb-8 pb-5 border-b border-border/60">
      <div className="flex items-center gap-4 min-w-0">
        {Icon && (
          <div
            className={`shrink-0 w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br ${iconGradient} flex items-center justify-center shadow-md ring-4 ring-primary/10`}
          >
            <Icon className="w-5 h-5 sm:w-6 sm:h-6 text-white" strokeWidth={2.2} />
          </div>
        )}
        <div className="min-w-0">
          <h1
            className="text-xl sm:text-2xl md:text-3xl font-display font-semibold text-foreground tracking-tight truncate"
            data-testid={testId}
          >
            {title}
          </h1>
          {description && (
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 sm:mt-1">
              {description}
            </p>
          )}
        </div>
      </div>
      {actions && (
        <div className="flex items-center gap-2 shrink-0 flex-wrap">{actions}</div>
      )}
    </div>
  );
}
