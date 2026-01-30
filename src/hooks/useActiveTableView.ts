import { useState, useEffect, useMemo } from "react";
import { useBrand } from "@/contexts/BrandContext";
import { useFieldDefinitions } from "@/hooks/useCustomFields";
import {
  useTableViews,
  useDefaultTableView,
  DEFAULT_COLUMNS,
  type TableColumn,
  type ContactTableView,
} from "@/hooks/useTableViews";

const STORAGE_KEY = "contacts-active-view";

/**
 * Hook to manage the active table view with localStorage persistence,
 * including merging custom fields as additional columns.
 */
export function useActiveTableView() {
  const { currentBrand, isAllBrandsSelected } = useBrand();
  const { data: views = [], isLoading: viewsLoading } = useTableViews();
  const { data: fieldDefinitions = [] } = useFieldDefinitions();
  const defaultView = useDefaultTableView();

  // Load active view ID from localStorage
  const [activeViewId, setActiveViewId] = useState<string>(() => {
    if (typeof window === "undefined") return "default";
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored || "default";
  });

  // Persist active view ID to localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, activeViewId);
    }
  }, [activeViewId]);

  // Get the active view object
  const activeView = useMemo(() => {
    if (activeViewId === "default") {
      return defaultView;
    }
    return views.find((v) => v.id === activeViewId) || defaultView;
  }, [activeViewId, views, defaultView]);

  // Convert custom field definitions to table columns
  const customFieldColumns = useMemo((): TableColumn[] => {
    return fieldDefinitions.map((f) => ({
      key: `cf_${f.key}`,
      label: f.label,
      visible: false, // Hidden by default
    }));
  }, [fieldDefinitions]);

  // Merge base columns with custom field columns
  const allAvailableColumns = useMemo((): TableColumn[] => {
    const baseColumns = DEFAULT_COLUMNS.map((col) => ({
      ...col,
      // Show brand column in all-brands view
      visible: col.key === "brand_name" ? isAllBrandsSelected : col.visible,
    }));

    // Add custom fields that aren't already in the columns
    const existingKeys = new Set(baseColumns.map((c) => c.key));
    const newCustomFields = customFieldColumns.filter(
      (cf) => !existingKeys.has(cf.key)
    );

    return [...baseColumns, ...newCustomFields];
  }, [customFieldColumns, isAllBrandsSelected]);

  // The columns from the active view, merged with any new custom fields
  const activeColumns = useMemo((): TableColumn[] => {
    const viewColumns = activeView.columns;
    const existingKeys = new Set(viewColumns.map((c) => c.key));

    // Add any new custom fields that aren't in the saved view
    const newCustomFields = customFieldColumns.filter(
      (cf) => !existingKeys.has(cf.key)
    );

    // Also ensure we have all base columns
    const baseKeys = new Set(DEFAULT_COLUMNS.map((c) => c.key));
    const missingBaseColumns = DEFAULT_COLUMNS.filter(
      (col) => !existingKeys.has(col.key)
    ).map((col) => ({
      ...col,
      visible: col.key === "brand_name" ? isAllBrandsSelected : col.visible,
    }));

    return [...viewColumns, ...missingBaseColumns, ...newCustomFields];
  }, [activeView, customFieldColumns, isAllBrandsSelected]);

  return {
    activeViewId,
    setActiveViewId,
    activeView,
    activeColumns,
    allAvailableColumns,
    views,
    viewsLoading,
    customFieldColumns,
  };
}
