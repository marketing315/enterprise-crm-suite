import {
  UserPlus,
  Tag,
  Briefcase,
  Ticket,
  Webhook,
  PhoneCall,
  StickyNote,
  GitBranch,
  Timer,
  Repeat,
  Globe,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ActionType } from "@/hooks/useAutomationRules";

const NODE_CONFIG: Record<string, { icon: LucideIcon; color: string; bg: string }> = {
  upsert_contact: { icon: UserPlus, color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-950/40" },
  add_tag: { icon: Tag, color: "text-violet-600", bg: "bg-violet-50 dark:bg-violet-950/40" },
  create_deal: { icon: Briefcase, color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950/40" },
  create_ticket: { icon: Ticket, color: "text-orange-600", bg: "bg-orange-50 dark:bg-orange-950/40" },
  send_outbound_webhook: { icon: Webhook, color: "text-cyan-600", bg: "bg-cyan-50 dark:bg-cyan-950/40" },
  set_callback_requested: { icon: PhoneCall, color: "text-pink-600", bg: "bg-pink-50 dark:bg-pink-950/40" },
  log_note: { icon: StickyNote, color: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-950/40" },
  if_else: { icon: GitBranch, color: "text-purple-600", bg: "bg-purple-50 dark:bg-purple-950/40" },
  delay: { icon: Timer, color: "text-sky-600", bg: "bg-sky-50 dark:bg-sky-950/40" },
  loop: { icon: Repeat, color: "text-teal-600", bg: "bg-teal-50 dark:bg-teal-950/40" },
  http_request: { icon: Globe, color: "text-indigo-600", bg: "bg-indigo-50 dark:bg-indigo-950/40" },
};

interface WorkflowNodeIconProps {
  type: ActionType | string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function WorkflowNodeIcon({ type, size = "md", className }: WorkflowNodeIconProps) {
  const config = NODE_CONFIG[type] || { icon: Zap, color: "text-muted-foreground", bg: "bg-muted" };
  const Icon = config.icon;

  const sizeClasses = {
    sm: "h-6 w-6",
    md: "h-8 w-8",
    lg: "h-10 w-10",
  };

  const iconSizes = {
    sm: "h-3 w-3",
    md: "h-4 w-4",
    lg: "h-5 w-5",
  };

  return (
    <div
      className={cn(
        "rounded-lg flex items-center justify-center shrink-0",
        sizeClasses[size],
        config.bg,
        className
      )}
    >
      <Icon className={cn(iconSizes[size], config.color)} />
    </div>
  );
}

export function getNodeConfig(type: string) {
  return NODE_CONFIG[type] || { icon: Zap, color: "text-muted-foreground", bg: "bg-muted" };
}
