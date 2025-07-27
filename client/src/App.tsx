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
import TerminalsPage from "@/pages/TerminalsPage";
import TerminalViewPage from "@/pages/TerminalViewPage";
import TddfPage from "@/pages/tddf-page";
import OrphanTerminalsPage from "@/pages/OrphanTerminalsPage";
import OrphanTerminalViewPage from "@/pages/OrphanTerminalViewPage";
import MMSMerchants from "@/pages/MMSMerchants";
import AuthPage from "@/pages/auth-page";
import Backups from "@/pages/Backups";
import Logs from "@/pages/Logs";
import MMSUploader from "@/pages/MMSUploader";
import ProcessingDashboardPage from "@/pages/ProcessingDashboardPage";

function Router() {
  return (
    <Switch>
      <ProtectedRoute path="/" component={Dashboard} />
      <ProtectedRoute path="/merchants" component={Merchants} />
      <ProtectedRoute path="/merchants/new" component={NewMerchant} />
      <ProtectedRoute path="/merchants/:id" component={MerchantDetail} />
      <ProtectedRoute path="/mms-merchants" component={MMSMerchants} />
      <ProtectedRoute path="/terminals" component={TerminalsPage} />
      <ProtectedRoute path="/terminals/:id" component={TerminalViewPage} />
      <ProtectedRoute path="/orphan-terminals" component={OrphanTerminalsPage} />
      <ProtectedRoute path="/orphan-terminals/:terminalId" component={OrphanTerminalViewPage} />
      <ProtectedRoute path="/transactions" component={Transactions} />
      <ProtectedRoute path="/tddf-records" component={TddfPage} />
      <ProtectedRoute path="/tddf" component={TddfPage} />
      <ProtectedRoute path="/settings" component={Settings} />
      <ProtectedRoute path="/analytics" component={Analytics} />
      <ProtectedRoute path="/processing-dashboard" component={ProcessingDashboardPage} />
      <ProtectedRoute path="/exports" component={Exports} />
      <ProtectedRoute path="/uploads" component={Uploads} />
      <ProtectedRoute path="/dev-upload" component={MMSUploader} />
      <ProtectedRoute path="/backups" component={Backups} />
      <ProtectedRoute path="/logs" component={Logs} />
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
