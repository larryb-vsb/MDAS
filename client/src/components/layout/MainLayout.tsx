import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuth } from "@/hooks/use-auth";
import { APP_VERSION, BUILD_DATE } from "@shared/version";
import { FallbackStorageAlert } from "@/components/ui/fallback-storage-alert";
import { 
  BarChart3, 
  Home, 
  Settings, 
  FileText, 
  UploadCloud, 
  Users, 
  Menu,
  DollarSign,
  LogOut,
  Loader2,
  Info,
  ScrollText,
  ArchiveRestore
} from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger 
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";

interface NavItemProps {
  icon: React.ReactNode;
  label: string;
  href: string;
  isActive: boolean;
  onClick?: () => void;
  adminOnly?: boolean;
}

const navItems = [
  {
    icon: <Home className="h-5 w-5 text-gray-300" />,
    label: "Dashboard",
    href: "/"
  },
  {
    icon: <Users className="h-5 w-5 text-gray-300" />,
    label: "Merchants",
    href: "/merchants"
  },
  {
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
      </svg>
    ),
    label: "Terminals",
    href: "/terminals"
  },
  {
    icon: <DollarSign className="h-5 w-5 text-gray-300" />,
    label: "Transactions",
    href: "/transactions"
  },
  {
    icon: <BarChart3 className="h-5 w-5 text-gray-300" />,
    label: "Analytics",
    href: "/analytics"
  },
  {
    icon: <UploadCloud className="h-5 w-5 text-gray-300" />,
    label: "Uploads",
    href: "/uploads"
  },
  {
    icon: <FileText className="h-5 w-5 text-gray-300" />,
    label: "Exports",
    href: "/exports"
  },
  {
    icon: <Settings className="h-5 w-5 text-gray-300" />,
    label: "Settings",
    href: "/settings"
  },
  {
    icon: <ScrollText className="h-5 w-5 text-gray-300" />,
    label: "Logs",
    href: "/logs",
    adminOnly: true
  },
  {
    icon: <ArchiveRestore className="h-5 w-5 text-gray-300" />,
    label: "Backups", 
    href: "/backups",
    adminOnly: true
  }
];

function NavItem({ icon, label, href, isActive, onClick }: NavItemProps) {
  return (
    <div onClick={onClick}>
      <Link href={href}>
        <div
          className={cn(
            "flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-md transition-all cursor-pointer",
            isActive ? "text-white bg-gray-700" : "text-gray-300 hover:bg-gray-700"
          )}
        >
          {icon}
          <span>{label}</span>
        </div>
      </Link>
    </div>
  );
}

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const { user, logoutMutation } = useAuth();
  const { toast } = useToast();
  
  // Check if user is admin
  const isAdmin = user?.role === "admin";
  
  // Filter navigation items based on admin status
  const filteredNavItems = navItems.filter(item => !item.adminOnly || isAdmin);
  
  const handleLogout = () => {
    logoutMutation.mutate(undefined, {
      onSuccess: () => {
        toast({
          title: "Logged out",
          description: "You have been successfully logged out",
        });
      },
      onError: (error) => {
        toast({
          title: "Logout failed",
          description: error.message,
          variant: "destructive",
        });
      }
    });
  };

  // Mobile navigation
  const MobileNav = () => (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden text-white">
          <Menu className="h-5 w-5" />
          <span className="sr-only">Toggle menu</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 p-0 bg-gray-800 text-white">
        <ScrollArea className="h-full py-6">
          <div className="flex flex-col gap-6 px-4">
            <div className="flex h-12 items-center gap-2 px-4">
              <h2 className="text-lg font-bold text-white">MMS Dashboard</h2>
            </div>
            <nav className="flex flex-col gap-1">
              {filteredNavItems.map((item, index) => (
                <NavItem
                  key={index}
                  icon={item.icon}
                  label={item.label}
                  href={item.href}
                  isActive={location === item.href}
                  onClick={() => setOpen(false)}
                />
              ))}
              
              {/* Mobile version info for non-logged-in users */}
              {!user && (
                <div className="mt-4 pt-4 border-t border-gray-700">
                  <div className="text-gray-400 text-xs flex items-center justify-between px-4">
                    <span>Version {APP_VERSION}</span>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex items-center cursor-help">
                            <Info className="h-3 w-3 ml-1" />
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <div className="text-xs">
                            <p>Version: {APP_VERSION}</p>
                            <p>Build date: {BUILD_DATE}</p>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </div>
              )}
              
              {/* Mobile logout */}
              {user && (
                <div className="mt-4 pt-4 border-t border-gray-700">
                  <div className="text-gray-300 text-sm mb-2 px-4">
                    <div className="font-medium">
                      {user.firstName ? `${user.firstName} ${user.lastName || ''}` : user.username}
                    </div>
                    <div className="text-gray-400 text-xs">{user.email}</div>
                  </div>
                  <div
                    className="flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-md transition-all cursor-pointer text-gray-300 hover:bg-gray-700"
                    onClick={(e) => {
                      e.preventDefault();
                      handleLogout();
                      setOpen(false);
                    }}
                  >
                    <LogOut className="h-5 w-5 text-gray-300" />
                    <span>Logout</span>
                  </div>
                  
                  {/* Version info for mobile */}
                  <div className="mt-4 pt-3 border-t border-gray-700 text-gray-400 text-xs flex items-center justify-between px-4">
                    <span>Version {APP_VERSION}</span>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex items-center cursor-help">
                            <Info className="h-3 w-3 ml-1" />
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <div className="text-xs">
                            <p>Version: {APP_VERSION}</p>
                            <p>Build date: {BUILD_DATE}</p>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </div>
              )}
            </nav>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 flex-col md:flex border-r bg-gray-800 px-4 py-6">
        <div className="flex h-12 items-center px-4 mb-6">
          <h2 className="text-lg font-bold text-white">MMS Dashboard</h2>
        </div>
        <ScrollArea className="flex-1">
          <nav className="flex flex-col gap-1 px-2">
            {filteredNavItems.map((item, index) => (
              <NavItem
                key={index}
                icon={item.icon}
                label={item.label}
                href={item.href}
                isActive={
                  location === item.href || 
                  (item.href !== "/" && location.startsWith(item.href))
                }
              />
            ))}
          </nav>
        </ScrollArea>
        
        {/* Version info for non-logged-in users */}
        {!user && (
          <div className="mt-auto pt-4 border-t border-gray-700 px-4">
            <div className="text-gray-400 text-xs flex items-center justify-between">
              <span>Version {APP_VERSION}</span>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center cursor-help">
                      <Info className="h-3 w-3 ml-1" />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <div className="text-xs">
                      <p>Version: {APP_VERSION}</p>
                      <p>Build date: {BUILD_DATE}</p>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        )}
        
        {/* User info and logout */}
        {user && (
          <div className="mt-auto pt-4 border-t border-gray-700 px-4">
            <div className="text-gray-300 text-sm mb-2">
              <div className="font-medium">
                {user.firstName ? `${user.firstName} ${user.lastName || ''}` : user.username}
              </div>
              <div className="text-gray-400 text-xs">{user.email}</div>
            </div>
            <Button 
              variant="outline" 
              className="w-full justify-start text-gray-300 hover:text-white hover:bg-gray-700"
              onClick={handleLogout}
              disabled={logoutMutation.isPending}
            >
              {logoutMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Logging out...
                </>
              ) : (
                <>
                  <LogOut className="mr-2 h-4 w-4" />
                  Logout
                </>
              )}
            </Button>
            
            {/* Version info */}
            <div className="mt-4 pt-3 border-t border-gray-700 text-gray-400 text-xs flex items-center justify-between">
              <span>Version {APP_VERSION}</span>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center cursor-help">
                      <Info className="h-3 w-3 ml-1" />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <div className="text-xs">
                      <p>Version: {APP_VERSION}</p>
                      <p>Build date: {BUILD_DATE}</p>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        )}
      </aside>
      
      <div className="flex flex-1 flex-col">
        {/* Mobile header */}
        <header className="sticky top-0 z-10 flex h-16 items-center gap-4 border-b bg-gray-800 text-white px-6 md:hidden">
          <MobileNav />
          <h1 className="text-xl font-bold">MMS Dashboard</h1>
        </header>
        
        {/* Main content */}
        <main className="flex-1 bg-gray-100 p-6">
          <FallbackStorageAlert />
          {children}
        </main>
      </div>
    </div>
  );
}