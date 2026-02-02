import { Badge } from '@/components/ui/badge';
import { useBrand } from '@/contexts/BrandContext';

// Predefined color palette for brands (cycling through these)
const BRAND_COLORS = [
  { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-300', border: 'border-blue-200 dark:border-blue-800' },
  { bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-300', border: 'border-emerald-200 dark:border-emerald-800' },
  { bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-700 dark:text-purple-300', border: 'border-purple-200 dark:border-purple-800' },
  { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-300', border: 'border-amber-200 dark:border-amber-800' },
  { bg: 'bg-rose-100 dark:bg-rose-900/30', text: 'text-rose-700 dark:text-rose-300', border: 'border-rose-200 dark:border-rose-800' },
  { bg: 'bg-cyan-100 dark:bg-cyan-900/30', text: 'text-cyan-700 dark:text-cyan-300', border: 'border-cyan-200 dark:border-cyan-800' },
  { bg: 'bg-orange-100 dark:bg-orange-900/30', text: 'text-orange-700 dark:text-orange-300', border: 'border-orange-200 dark:border-orange-800' },
  { bg: 'bg-indigo-100 dark:bg-indigo-900/30', text: 'text-indigo-700 dark:text-indigo-300', border: 'border-indigo-200 dark:border-indigo-800' },
];

function hashBrandId(brandId: string): number {
  let hash = 0;
  for (let i = 0; i < brandId.length; i++) {
    const char = brandId.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

export function getBrandColor(brandId: string) {
  const index = hashBrandId(brandId) % BRAND_COLORS.length;
  return BRAND_COLORS[index];
}

interface BrandBadgeProps {
  brandId: string;
  className?: string;
  size?: 'sm' | 'default';
}

export function BrandBadge({ brandId, className = '', size = 'default' }: BrandBadgeProps) {
  const { brands, systemBrand } = useBrand();
  
  // Find brand name
  const brand = brands.find(b => b.id === brandId) || (systemBrand?.id === brandId ? systemBrand : null);
  const brandName = brand?.name || 'Brand sconosciuto';
  
  // Get color based on brand ID
  const color = getBrandColor(brandId);
  
  const sizeClasses = size === 'sm' ? 'text-[10px] px-1.5 py-0' : 'text-xs px-2 py-0.5';
  
  return (
    <Badge 
      variant="outline" 
      className={`${color.bg} ${color.text} ${color.border} font-medium ${sizeClasses} ${className}`}
    >
      {brandName}
    </Badge>
  );
}
