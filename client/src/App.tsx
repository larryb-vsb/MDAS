import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/Dashboard";
import Settings from "@/pages/Settings";
import Analytics from "@/pages/Analytics";
import Exports from "@/pages/Exports";
import MerchantDetail from "@/pages/MerchantDetail";
import NewMerchant from "@/pages/NewMerchant";
import Uploads from "@/pages/Uploads";
import Transactions from "@/pages/Transactions";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/merchants/new" component={NewMerchant} />
      <Route path="/merchants/:id" component={MerchantDetail} />
      <Route path="/transactions" component={Transactions} />
      <Route path="/settings" component={Settings} />
      <Route path="/analytics" component={Analytics} />
      <Route path="/exports" component={Exports} />
      <Route path="/uploads" component={Uploads} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
