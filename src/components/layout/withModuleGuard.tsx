import { FrozenModuleGuard } from "@/components/layout/FrozenModuleGuard";

/** Wraps a page component with module status guard + telemetry */
export function withModuleGuard(moduleKey: string, Component: React.ComponentType) {
  return function GuardedModule() {
    return (
      <FrozenModuleGuard moduleKey={moduleKey}>
        <Component />
      </FrozenModuleGuard>
    );
  };
}
