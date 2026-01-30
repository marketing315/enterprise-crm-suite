import { Plus, ChevronDown, Check, Settings2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { ContactTableView } from "@/hooks/useTableViews";

interface TableViewSelectorProps {
  views: ContactTableView[];
  activeViewId: string;
  onViewChange: (viewId: string) => void;
  onNewView: () => void;
  onEditView: (view: ContactTableView) => void;
}

export function TableViewSelector({
  views,
  activeViewId,
  onViewChange,
  onNewView,
  onEditView,
}: TableViewSelectorProps) {
  const activeView = views.find((v) => v.id === activeViewId);
  const displayName = activeView?.name || "Vista predefinita";
  const isDefaultView = activeViewId === "default";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="gap-2 min-w-[160px] justify-between">
          <span className="truncate max-w-[120px]">{displayName}</span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>Viste salvate</DropdownMenuLabel>
        <DropdownMenuSeparator />
        
        {/* Default view */}
        <DropdownMenuItem
          onClick={() => onViewChange("default")}
          className="gap-2"
        >
          {activeViewId === "default" && <Check className="h-4 w-4" />}
          {activeViewId !== "default" && <div className="w-4" />}
          <span>Vista predefinita</span>
        </DropdownMenuItem>

        {/* User views */}
        {views.length > 0 && (
          <>
            <DropdownMenuSeparator />
            {views.map((view) => (
              <DropdownMenuItem
                key={view.id}
                onClick={() => onViewChange(view.id)}
                className="gap-2 group"
              >
                {activeViewId === view.id && <Check className="h-4 w-4" />}
                {activeViewId !== view.id && <div className="w-4" />}
                <span className="flex-1 truncate">{view.name}</span>
                {view.is_default && (
                  <Badge variant="secondary" className="text-xs">
                    default
                  </Badge>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEditView(view);
                  }}
                >
                  <Settings2 className="h-3 w-3" />
                </Button>
              </DropdownMenuItem>
            ))}
          </>
        )}

        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onNewView} className="gap-2 text-primary">
          <Plus className="h-4 w-4" />
          <span>Nuova vista</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
