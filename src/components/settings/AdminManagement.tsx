import { useBrand } from "@/contexts/BrandContext";
import { BrandManagementCard } from "./admin/BrandManagementCard";
import { UserManagementCard } from "./admin/UserManagementCard";

export function AdminManagement() {
  const { brands } = useBrand();

  return (
    <div className="space-y-6">
      <BrandManagementCard brands={brands} />
      <UserManagementCard brands={brands} />
    </div>
  );
}
