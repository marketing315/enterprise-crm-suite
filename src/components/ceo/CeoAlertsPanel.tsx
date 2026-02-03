import { useState } from 'react';
import { 
  AlertTriangle, 
  AlertCircle, 
  CheckCircle2, 
  Info, 
  ChevronDown, 
  ChevronUp,
  Lightbulb 
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import type { CeoAlert } from '@/types/company';

interface CeoAlertsPanelProps {
  alerts: CeoAlert[];
}

const severityConfig = {
  error: {
    icon: AlertCircle,
    color: 'text-red-600',
    bg: 'bg-red-50 dark:bg-red-950/30',
    border: 'border-red-200 dark:border-red-900',
    badge: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  },
  warning: {
    icon: AlertTriangle,
    color: 'text-yellow-600',
    bg: 'bg-yellow-50 dark:bg-yellow-950/30',
    border: 'border-yellow-200 dark:border-yellow-900',
    badge: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  },
  success: {
    icon: CheckCircle2,
    color: 'text-green-600',
    bg: 'bg-green-50 dark:bg-green-950/30',
    border: 'border-green-200 dark:border-green-900',
    badge: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  },
  info: {
    icon: Info,
    color: 'text-blue-600',
    bg: 'bg-blue-50 dark:bg-blue-950/30',
    border: 'border-blue-200 dark:border-blue-900',
    badge: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  },
};

const alertTypeLabels: Record<string, string> = {
  MARGIN_DECLINING: 'Margine in calo',
  COST_ANOMALY: 'Anomalia costi',
  BUDGET_EXCEEDED: 'Budget superato',
  REVENUE_DROP: 'Calo fatturato',
  POSITIVE_TREND: 'Trend positivo',
  MISSING_COSTS: 'Costi mancanti',
  MARKETING_ROI_LOW: 'ROI Marketing basso',
};

function AlertItem({ alert }: { alert: CeoAlert }) {
  const [isOpen, setIsOpen] = useState(false);
  const config = severityConfig[alert.severity];
  const Icon = config.icon;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className={`rounded-lg border p-4 ${config.bg} ${config.border}`}>
        <CollapsibleTrigger asChild>
          <button className="w-full text-left">
            <div className="flex items-start gap-3">
              <Icon className={`h-5 w-5 mt-0.5 ${config.color}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className={config.badge}>
                    {alertTypeLabels[alert.type] || alert.type}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    Valore: {alert.metric_value.toFixed(1)} (soglia: {alert.threshold_value})
                  </span>
                </div>
                <p className="mt-1 text-sm font-medium">
                  {alert.message}
                </p>
              </div>
              <Button variant="ghost" size="sm" className="shrink-0">
                {isOpen ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </Button>
            </div>
          </button>
        </CollapsibleTrigger>
        
        <CollapsibleContent>
          <div className="mt-4 pl-8 space-y-3">
            {alert.root_causes && alert.root_causes.filter(Boolean).length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">
                  Cause principali:
                </p>
                <ul className="text-sm space-y-1">
                  {alert.root_causes.filter(Boolean).map((cause, idx) => (
                    <li key={idx} className="flex items-center gap-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-50" />
                      {cause}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            
            {alert.suggested_action && (
              <div className="flex items-start gap-2 p-3 rounded-md bg-background/50">
                <Lightbulb className="h-4 w-4 text-yellow-500 mt-0.5" />
                <div>
                  <p className="text-xs font-medium text-muted-foreground">
                    Azione suggerita:
                  </p>
                  <p className="text-sm">{alert.suggested_action}</p>
                </div>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

export function CeoAlertsPanel({ alerts }: CeoAlertsPanelProps) {
  if (!alerts || alerts.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            Nessun Alert
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Tutti gli indicatori sono nella norma. Nessuna anomalia rilevata.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Sort by severity: error > warning > info > success
  const severityOrder = { error: 0, warning: 1, info: 2, success: 3 };
  const sortedAlerts = [...alerts].sort(
    (a, b) => severityOrder[a.severity] - severityOrder[b.severity]
  );

  const errorCount = alerts.filter(a => a.severity === 'error').length;
  const warningCount = alerts.filter(a => a.severity === 'warning').length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-lg">
            <AlertTriangle className="h-5 w-5 text-yellow-600" />
            Alert & Anomalie
          </span>
          <div className="flex items-center gap-2">
            {errorCount > 0 && (
              <Badge variant="destructive">{errorCount} critici</Badge>
            )}
            {warningCount > 0 && (
              <Badge variant="secondary">{warningCount} avvisi</Badge>
            )}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {sortedAlerts.map((alert, idx) => (
          <AlertItem key={idx} alert={alert} />
        ))}
      </CardContent>
    </Card>
  );
}
