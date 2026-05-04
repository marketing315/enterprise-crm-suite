import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatCurrency } from '@/lib/formatKpi';
import type { CostByCenter, CostByCategory } from '@/types/company';

interface CeoCostBreakdownProps {
  costsByCenter: CostByCenter[];
  costsByCategory: CostByCategory[];
}

const COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
  'hsl(217, 91%, 60%)',
  'hsl(280, 65%, 60%)',
  'hsl(45, 93%, 47%)',
];

const categoryTypeLabels: Record<string, string> = {
  direct: 'Diretti',
  indirect: 'Indiretti',
  personnel: 'Personale',
  marketing: 'Marketing',
  overhead: 'Overhead',
};

const categoryTypeColors: Record<string, string> = {
  direct: 'hsl(var(--chart-1))',
  indirect: 'hsl(var(--chart-2))',
  personnel: 'hsl(var(--chart-3))',
  marketing: 'hsl(var(--chart-4))',
  overhead: 'hsl(var(--chart-5))',
};

export function CeoCostBreakdown({ costsByCenter, costsByCategory }: CeoCostBreakdownProps) {
  // Prepare data for stacked bar (by category type)
  const categoryTypeData = costsByCategory.reduce((acc, cat) => {
    const type = cat.type || 'direct';
    const existing = acc.find(item => item.type === type);
    if (existing) {
      existing.amount += cat.amount;
    } else {
      acc.push({ 
        type, 
        label: categoryTypeLabels[type] || type,
        amount: cat.amount,
        fill: categoryTypeColors[type] || COLORS[0],
      });
    }
    return acc;
  }, [] as Array<{ type: string; label: string; amount: number; fill: string }>);

  // Prepare data for pie chart (by center)
  const centerData = costsByCenter
    .filter(c => c.amount > 0)
    .map((center, idx) => ({
      name: center.center_name,
      value: center.amount,
      fill: COLORS[idx % COLORS.length],
    }));

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-background border rounded-lg shadow-lg p-2">
          <p className="text-sm font-medium">{payload[0].name || payload[0].payload.label}</p>
          <p className="text-sm text-muted-foreground">
            {formatCurrency(payload[0].value)}
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <Card className="min-h-[280px]">
      <CardHeader>
        <CardTitle className="text-lg">Breakdown Costi</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="type" className="space-y-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="type">Per Tipo</TabsTrigger>
            <TabsTrigger value="center">Per Centro</TabsTrigger>
          </TabsList>
          
          <TabsContent value="type" className="h-[300px]">
            {categoryTypeData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={categoryTypeData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                  <XAxis 
                    type="number" 
                    tickFormatter={(value) => `€${(value / 1000).toFixed(0)}k`}
                  />
                  <YAxis 
                    type="category" 
                    dataKey="label" 
                    width={80}
                    tick={{ fontSize: 12 }}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar 
                    dataKey="amount" 
                    radius={[0, 4, 4, 0]}
                  >
                    {categoryTypeData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground">
                Nessun dato disponibile
              </div>
            )}
          </TabsContent>
          
          <TabsContent value="center" className="h-[300px]">
            {centerData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={centerData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                    dataKey="value"
                    nameKey="name"
                    label={({ name, percent }) => 
                      `${name} (${(percent * 100).toFixed(0)}%)`
                    }
                    labelLine={false}
                  >
                    {centerData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground">
                Nessun centro di costo definito
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
