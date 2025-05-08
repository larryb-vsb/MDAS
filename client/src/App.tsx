import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/use-auth";
import { ProtectedRoute } from "@/lib/protected-route";
import { Toaster } from "@/components/ui/toaster";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/Dashboard";
import Settings from "@/pages/Settings";
import Analytics from "@/pages/Analytics";
import Exports from "@/pages/Exports";
import MerchantDetail from "@/pages/MerchantDetail";
import NewMerchant from "@/pages/NewMerchant";
import Merchants from "@/pages/Merchants";
import Uploads from "@/pages/Uploads";
import Transactions from "@/pages/Transactions";
import AuthPage from "@/pages/auth-page";

function Router() {
  return (
    <Switch>
      <ProtectedRoute path="/" component={Dashboard} />
      <ProtectedRoute path="/merchants" component={Merchants} />
      <ProtectedRoute path="/merchants/new" component={NewMerchant} />
      <ProtectedRoute path="/merchants/:id" component={MerchantDetail} />
      <ProtectedRoute path="/transactions" component={Transactions} />
      <ProtectedRoute path="/settings" component={Settings} />
      <ProtectedRoute path="/analytics" component={Analytics} />
      <ProtectedRoute path="/exports" component={Exports} />
      <ProtectedRoute path="/uploads" component={Uploads} />
      <Route path="/auth" component={AuthPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Router />
          <Toaster />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
