import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface KpiItem {
  title: string;
  value: number | string;
  subtitle?: string;
  icon: LucideIcon;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  variant?: "default" | "warning" | "success" | "destructive";
}

interface DashboardKpiGridProps {
  items: KpiItem[];
  isLoading?: boolean;
}

export function DashboardKpiGrid({ items, isLoading }: DashboardKpiGridProps) {
  if (isLoading) {
    return (
      <div className="grid gap-3 md:gap-4 grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-3 md:p-6 md:pb-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-4 rounded" />
            </CardHeader>
            <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
              <Skeleton className="h-8 w-16 mb-1" />
              <Skeleton className="h-3 w-24" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const getVariantStyles = (variant: KpiItem["variant"]) => {
    switch (variant) {
      case "warning":
        return "border-amber-500/30 bg-amber-500/5";
      case "success":
        return "border-green-500/30 bg-green-500/5";
      case "destructive":
        return "border-destructive/30 bg-destructive/5";
      default:
        return "";
    }
  };

  return (
    <div className="grid gap-3 md:gap-4 grid-cols-2 lg:grid-cols-4">
      {items.map((item, index) => {
        const Icon = item.icon;
        return (
          <Card key={index} className={cn("transition-all hover:shadow-md", getVariantStyles(item.variant))}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-3 md:p-6 md:pb-2">
              <CardTitle className="text-xs md:text-sm font-medium text-muted-foreground">
                {item.title}
              </CardTitle>
              <div className={cn(
                "p-1.5 rounded-lg",
                item.variant === "destructive" ? "bg-destructive/10 text-destructive" :
                item.variant === "warning" ? "bg-amber-500/10 text-amber-600" :
                item.variant === "success" ? "bg-green-500/10 text-green-600" :
                "bg-primary/10 text-primary"
              )}>
                <Icon className="h-3.5 w-3.5 md:h-4 md:w-4" />
              </div>
            </CardHeader>
            <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
              <div className="flex items-baseline gap-2">
                <span className="text-xl md:text-2xl font-bold tracking-tight">{item.value}</span>
                {item.trend && (
                  <span className={cn(
                    "text-xs font-medium",
                    item.trend.isPositive ? "text-green-600" : "text-destructive"
                  )}>
                    {item.trend.isPositive ? "+" : ""}{item.trend.value}%
                  </span>
                )}
              </div>
              {item.subtitle && (
                <p className="text-xs text-muted-foreground mt-0.5 hidden sm:block">
                  {item.subtitle}
                </p>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
