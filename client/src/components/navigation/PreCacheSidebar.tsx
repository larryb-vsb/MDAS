import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { 
  Database, 
  Activity, 
  Settings, 
  TrendingUp, 
  AlertTriangle, 
  Clock,
  BarChart3,
  Cog,
  Shield,
  FileText,
  Home,
  Timer
} from "lucide-react";

interface SidebarItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  badgeVariant?: "default" | "secondary" | "destructive" | "outline";
  description?: string;
}

interface PreCacheSidebarProps {
  currentTab: string;
  onTabChange: (tab: string) => void;
  className?: string;
  isCollapsed?: boolean;
}

const sidebarItems: SidebarItem[] = [
  {
    id: "overview",
    label: "Overview",
    icon: Home,
    description: "System overview and key metrics"
  },
  {
    id: "tables",
    label: "Pre-Cache Tables",
    icon: Database,
    description: "View and manage cached table data"
  },
  {
    id: "configuration",
    label: "Configuration",
    icon: Cog,
    description: "Cache configuration management"
  },
  {
    id: "heat-map",
    label: "Heat Map Cache",
    icon: Activity,
    description: "Heat map cache status and rebuild"
  },
  {
    id: "settings",
    label: "Settings",
    icon: Settings,
    description: "Individual cache settings"
  },
  {
    id: "performance",
    label: "Performance",
    icon: TrendingUp,
    description: "Performance metrics and analytics"
  },
  {
    id: "errors",
    label: "Errors",
    icon: AlertTriangle,
    description: "Error monitoring and diagnostics"
  }
];

export function PreCacheSidebar({ 
  currentTab, 
  onTabChange, 
  className,
  isCollapsed = false 
}: PreCacheSidebarProps) {
  return (
    <div className={cn(
      "flex flex-col bg-background border-r border-border",
      isCollapsed ? "w-16" : "w-64",
      className
    )}>
      {/* Header */}
      <div className="p-4 border-b border-border">
        {!isCollapsed ? (
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Pre-Cache</h2>
            <p className="text-sm text-muted-foreground">Management Console</p>
          </div>
        ) : (
          <div className="flex justify-center">
            <Database className="h-6 w-6" />
          </div>
        )}
      </div>

      {/* Navigation Items */}
      <ScrollArea className="flex-1 p-2">
        <nav className="space-y-1">
          {sidebarItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            
            return (
              <Button
                key={item.id}
                variant={isActive ? "secondary" : "ghost"}
                size="sm"
                className={cn(
                  "w-full justify-start gap-2 h-auto p-3",
                  isActive && "bg-secondary font-medium",
                  isCollapsed && "justify-center p-2"
                )}
                onClick={() => onTabChange(item.id)}
                title={isCollapsed ? `${item.label}: ${item.description}` : undefined}
              >
                <Icon className={cn(
                  "h-4 w-4 flex-shrink-0",
                  isActive ? "text-foreground" : "text-muted-foreground"
                )} />
                
                {!isCollapsed && (
                  <>
                    <div className="flex-1 text-left">
                      <div className="font-medium text-sm">{item.label}</div>
                      {item.description && (
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {item.description}
                        </div>
                      )}
                    </div>
                    
                    {item.badge && (
                      <Badge 
                        variant={item.badgeVariant || "secondary"} 
                        className="ml-auto text-xs"
                      >
                        {item.badge}
                      </Badge>
                    )}
                  </>
                )}
              </Button>
            );
          })}
        </nav>
      </ScrollArea>

      {/* Footer */}
      {!isCollapsed && (
        <div className="p-4 border-t border-border">
          <div className="text-xs text-muted-foreground space-y-1">
            <div className="flex items-center gap-2">
              <Timer className="h-3 w-3" />
              <span>Real-time monitoring active</span>
            </div>
            <div className="flex items-center gap-2">
              <Shield className="h-3 w-3" />
              <span>Never-expire cache policy</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}