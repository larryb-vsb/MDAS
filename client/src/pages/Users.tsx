import { Users as UsersIcon } from "lucide-react";
import UserManagement from "@/components/settings/UserManagement";
import MainLayout from "@/components/layout/MainLayout";

export default function Users() {
  return (
    <MainLayout>
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <UsersIcon className="h-6 w-6 text-blue-500" />
            User Management
          </h1>
          <p className="text-muted-foreground">Manage user accounts in the system</p>
        </div>

        <UserManagement />
      </div>
    </MainLayout>
  );
}
