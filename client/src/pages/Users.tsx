import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Home, Users as UsersIcon } from "lucide-react";
import UserManagement from "@/components/settings/UserManagement";

export default function Users() {
  const [, setLocation] = useLocation();

  const handleBackToDashboard = () => {
    setLocation("/");
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="sm"
            onClick={handleBackToDashboard}
            data-testid="button-back-dashboard"
          >
            <Home className="h-4 w-4" />
            <span className="hidden sm:inline ml-1">Dashboard</span>
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <UsersIcon className="h-6 w-6 text-blue-500" />
              User Management
            </h1>
            <p className="text-muted-foreground">Manage user accounts in the system</p>
          </div>
        </div>
      </div>

      <UserManagement />
    </div>
  );
}
