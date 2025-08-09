import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/use-auth";
import { ProtectedRoute } from "@/lib/protected-route";
import { Toaster } from "@/components/ui/toaster";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/Dashboard";
import HomeDashboardEnhanced from "@/pages/HomeDashboardEnhanced";
import Dashboard3 from "@/pages/Dashboard3";
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
import TddfJsonPage from "@/pages/TddfJsonPage";
import TddfJsonTestPage from "@/pages/TddfJsonTestPage";
import Tddf1Page from "@/pages/Tddf1Page";
import Tddf1MonthlyView from "@/pages/Tddf1MonthlyView";
import MerchantViewPage from "@/pages/MerchantViewPage";
import Tddf1MerchantDailyView from "@/pages/Tddf1MerchantDailyView";

import OrphanTerminalsPage from "@/pages/OrphanTerminalsPage";
import OrphanTerminalViewPage from "@/pages/OrphanTerminalViewPage";
import MMSMerchants from "@/pages/MMSMerchants";
import AuthPage from "@/pages/auth-page";
import Backups from "@/pages/Backups";
import Logs from "@/pages/Logs";
import MMSUploader from "@/pages/MMSUploader";
import SubTerminals from "@/pages/SubTerminals";
import ProcessingDashboardPage from "@/pages/ProcessingDashboardPage";
import ProcessingPage from "@/pages/ProcessingPage";
import ProcessingDashboardV2 from "@/pages/ProcessingDashboardV2";
import StorageManagement from "@/pages/StorageManagement";
import PreCacheManagement from "@/pages/PreCacheManagement";
import ChartsPage from "@/pages/ChartsPage";
function Router() {
  return (
    <Switch>
      <ProtectedRoute path="/" component={HomeDashboardEnhanced} />
      <ProtectedRoute path="/dashboard" component={Dashboard} />
      <ProtectedRoute path="/dashboard2" component={HomeDashboardEnhanced} />
      <ProtectedRoute path="/dashboard3" component={Dashboard3} />
      <ProtectedRoute path="/merchant-management" component={Dashboard} />
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
      <ProtectedRoute path="/tddf-json" component={TddfJsonPage} />
      <ProtectedRoute path="/tddf-json-test" component={TddfJsonTestPage} />
      <ProtectedRoute path="/tddf1" component={Tddf1Page} />
      <ProtectedRoute path="/tddf1/monthly" component={Tddf1MonthlyView} />
      <ProtectedRoute path="/tddf1-monthly" component={Tddf1MonthlyView} />
      <ProtectedRoute path="/tddf1-merchant/:merchantId/:date" component={Tddf1MerchantDailyView} />
      <ProtectedRoute path="/tddf1-merchant-daily-view/:merchantId" component={Tddf1MerchantDailyView} />
      <ProtectedRoute path="/merchant/:merchantId/:processingDate" component={MerchantViewPage} />

      <ProtectedRoute path="/settings" component={Settings} />
      <ProtectedRoute path="/analytics" component={Analytics} />
      <ProtectedRoute path="/processing-dashboard" component={ProcessingDashboardPage} />
      <ProtectedRoute path="/processing-dashboard-v2" component={ProcessingDashboardV2} />
      <ProtectedRoute path="/processing" component={ProcessingPage} />
      <ProtectedRoute path="/exports" component={Exports} />
      <ProtectedRoute path="/uploads" component={Uploads} />
      <ProtectedRoute path="/uploader" component={MMSUploader} />
      <ProtectedRoute path="/mms-uploader" component={MMSUploader} />
      <ProtectedRoute path="/subterminals" component={SubTerminals} />
      <ProtectedRoute path="/storage-management" component={StorageManagement} />
      <ProtectedRoute path="/pre-cache-management" component={PreCacheManagement} />
      <ProtectedRoute path="/pre-cache" component={PreCacheManagement} />
      <ProtectedRoute path="/charts" component={ChartsPage} />
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
