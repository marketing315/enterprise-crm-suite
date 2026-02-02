import { Badge } from '@/components/ui/badge';
import { useBrand } from '@/contexts/BrandContext';

// Custom brand colors (brand name lowercase -> color)
const CUSTOM_BRAND_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  'sonimed': { 
    bg: 'bg-[#89b928]/15', 
    text: 'text-[#89b928]', 
    border: 'border-[#89b928]/30' 
  },
  'mymed': { 
    bg: 'bg-[#1990ca]/15', 
    text: 'text-[#1990ca]', 
    border: 'border-[#1990ca]/30' 
  },
  'excell': { 
    bg: 'bg-[#e5176c]/15', 
    text: 'text-[#e5176c]', 
    border: 'border-[#e5176c]/30' 
  },
};

// Fallback color palette for brands without custom colors
const FALLBACK_COLORS = [
  { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-300', border: 'border-blue-200 dark:border-blue-800' },
  { bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-300', border: 'border-emerald-200 dark:border-emerald-800' },
  { bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-700 dark:text-purple-300', border: 'border-purple-200 dark:border-purple-800' },
  { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-300', border: 'border-amber-200 dark:border-amber-800' },
  { bg: 'bg-rose-100 dark:bg-rose-900/30', text: 'text-rose-700 dark:text-rose-300', border: 'border-rose-200 dark:border-rose-800' },
  { bg: 'bg-cyan-100 dark:bg-cyan-900/30', text: 'text-cyan-700 dark:text-cyan-300', border: 'border-cyan-200 dark:border-cyan-800' },
];

function hashBrandId(brandId: string): number {
  let hash = 0;
  for (let i = 0; i < brandId.length; i++) {
    const char = brandId.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

export function getBrandColor(brandId: string, brandName?: string) {
  // Check for custom color by brand name
  if (brandName) {
    const key = brandName.toLowerCase().trim();
    if (CUSTOM_BRAND_COLORS[key]) {
      return CUSTOM_BRAND_COLORS[key];
    }
  }
  
  // Fallback to hash-based color
  const index = hashBrandId(brandId) % FALLBACK_COLORS.length;
  return FALLBACK_COLORS[index];
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
  
  // Get color based on brand name (custom) or ID (fallback)
  const color = getBrandColor(brandId, brandName);
  
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
