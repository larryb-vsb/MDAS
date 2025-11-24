import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuth } from "@/hooks/use-auth";
import {
  ProfileEditDialog,
  ProfileEditDialogRef,
} from "@/components/ProfileEditDialog";

/*
 * =====================================================================
 * CRITICAL SIDEBAR MENU DISAPPEARING FIX - READ BEFORE ADDING PAGES
 * =====================================================================
 *
 * PROBLEM: Sidebar menu disappears after clicking on mobile devices when new pages are added
 *
 * ROOT CAUSE: Mobile navigation uses Sheet component with open/setOpen state management.
 * When a navigation item is clicked, the sheet needs to be explicitly closed to prevent
 * the menu from remaining open and appearing "disappeared" on subsequent interactions.
 *
 * SOLUTION REQUIREMENTS FOR NEW PAGES:
 *
 * 1. **ALWAYS** add onClick={() => setOpen(false)} to NavItem components in MobileNav
 * 2. **NEVER** forget to close the mobile sheet when navigation occurs
 * 3. **TEST** on mobile devices after adding any new navigation items
 * 4. **VERIFY** that both desktop sidebar AND mobile sheet work correctly
 *
 * EXAMPLES OF CORRECT Implementation:
 *
 * ✅ CORRECT - Mobile NavItem with proper onClick:
 * <NavItem
 *   key={index}
 *   icon={item.icon}
 *   label={item.label}
 *   href={item.href}
 *   onClick={() => setOpen(false)}  // <-- THIS IS REQUIRED!
 *   isActive={item.href === location}
 * />
 *
 * ✅ CORRECT - Desktop NavItem (no onClick needed):
 * <NavItem
 *   key={index}
 *   icon={item.icon}
 *   label={item.label}
 *   href={item.href}
 *   isActive={item.href === location}
 * />
 *
 * ❌ WRONG - Missing onClick on mobile:
 * <NavItem
 *   key={index}
 *   icon={item.icon}
 *   label={item.label}
 *   href={item.href}
 *   isActive={item.href === location}
 *   // Missing onClick={() => setOpen(false)} - WILL CAUSE MENU TO DISAPPEAR!
 * />
 *
 * TESTING CHECKLIST WHEN ADDING NEW PAGES:
 * □ Desktop sidebar navigation works
 * □ Mobile hamburger menu opens
 * □ Clicking menu items on mobile closes the sheet
 * □ Navigation works on both desktop and mobile
 * □ No ghost menus or disappeared states
 *
 * REMEMBER: The mobile navigation uses a completely different component (Sheet)
 * than the desktop sidebar. Both need to be handled correctly!
 *
 * Last Updated: 2025-08-01 - This issue has occurred multiple times
 * =====================================================================
 */
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
  Zap,
  Activity,
  FileJson,
  Database,
  ChevronDown,
  ChevronRight,
  Archive,
  HardDrive,
  History,
  UserCircle,
  Edit,
} from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { logger } from "@shared/logger";

interface NavItemProps {
  icon: React.ReactNode;
  label: string;
  href?: string;
  isActive?: boolean;
  onClick?: () => void;
  adminOnly?: boolean;
  submenu?: NavSubmenuItem[];
  isExpanded?: boolean;
  onToggle?: () => void;
}

interface NavSubmenuItem {
  icon: React.ReactNode;
  label: string;
  href: string;
}

const navItems = [
  {
    icon: <Home className="h-5 w-5 text-gray-300" />,
    label: "Dashboard",
    href: "/",
  },
  {
    icon: <Users className="h-5 w-5 text-gray-300" />,
    label: "Merchants",
    href: "/merchants",
  },
  {
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="h-5 w-5 text-gray-300"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z"
        />
      </svg>
    ),
    label: "Terminals",
    href: "/terminals",
  },
  {
    icon: <DollarSign className="h-5 w-5 text-gray-300" />,
    label: "Transactions",
    href: "/transactions",
  },

  {
    icon: <History className="h-5 w-5 text-cyan-400" />,
    label: "History",
    href: "/history",
  },
  {
    icon: <Database className="h-5 w-5 text-purple-400" />,
    label: "API Data",
    href: "/tddf-api",
  },
  {
    icon: <BarChart3 className="h-5 w-5 text-gray-300" />,
    label: "Analytics",
    href: "/analytics",
  },
  {
    icon: <Activity className="h-5 w-5 text-blue-400" />,
    label: "Processing",
    href: "/processing",
  },

  {
    icon: <HardDrive className="h-5 w-5 text-purple-400" />,
    label: "Storage Management",
    href: "/storage-management",
  },
  {
    icon: <Database className="h-5 w-5 text-green-400" />,
    label: "Pre-Cache Management",
    href: "/pre-cache-management",
  },
  {
    icon: <Archive className="h-5 w-5 text-amber-400" />,
    label: "Legacy",
    submenu: [
      {
        icon: <Zap className="h-5 w-5 text-orange-400" />,
        label: "MMS Uploader",
        href: "/uploader",
      },
      {
        icon: <FileJson className="h-5 w-5 text-blue-400" />,
        label: "TDDF 1",
        href: "/tddf1",
      },
      {
        icon: <Database className="h-4 w-4 text-gray-300" />,
        label: "Merchant Management",
        href: "/merchant-management",
      },
      {
        icon: <FileText className="h-4 w-4 text-gray-300" />,
        label: "TDDF Records",
        href: "/tddf",
      },
      {
        icon: <FileJson className="h-4 w-4 text-gray-300" />,
        label: "TDDF JSON",
        href: "/tddf-json",
      },
    ],
  },
  {
    icon: <FileText className="h-5 w-5 text-gray-300" />,
    label: "Exports",
    href: "/exports",
  },
  {
    icon: <ScrollText className="h-5 w-5 text-gray-300" />,
    label: "Logs",
    href: "/logs",
    adminOnly: true,
  },
  {
    icon: <Settings className="h-5 w-5 text-gray-300" />,
    label: "Settings",
    href: "/settings",
  },
];

/*
 * CRITICAL NAVIGATION FUNCTION - HANDLES BOTH DESKTOP AND MOBILE
 *
 * This NavItem function is used by BOTH desktop sidebar AND mobile Sheet navigation.
 * The onClick prop is ESSENTIAL for mobile devices to close the Sheet after navigation.
 *
 * When adding new pages, ensure mobile navigation calls NavItem with:
 * onClick={() => setOpen(false)}
 *
 * Without this, the mobile menu will appear to "disappear" after clicking.
 */
function NavItem({
  icon,
  label,
  href,
  isActive,
  onClick,
  submenu,
  isExpanded,
  onToggle,
}: NavItemProps) {
  const [location] = useLocation();

  // If this is a submenu item, render the collapsible submenu
  if (submenu) {
    return (
      <div className="relative">
        <div
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log("Submenu toggle clicked:", label);
            if (onToggle) {
              onToggle();
            }
          }}
          className={cn(
            "flex items-center justify-between gap-3 px-4 py-3 text-sm font-medium rounded-md transition-all cursor-pointer min-h-[44px] touch-manipulation relative z-50 select-none",
            isExpanded
              ? "text-white bg-gray-700 shadow-lg"
              : "text-gray-300 hover:bg-gray-700 hover:text-white hover:shadow-md",
          )}
          style={{
            WebkitUserSelect: "none",
            MozUserSelect: "none",
            msUserSelect: "none",
            userSelect: "none",
          }}
        >
          <div className="flex items-center gap-3">
            {icon}
            <span>{label}</span>
          </div>
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-gray-300" />
          ) : (
            <ChevronRight className="h-4 w-4 text-gray-300" />
          )}
        </div>

        {/* Submenu items */}
        {isExpanded && (
          <div className="ml-6 mt-1 space-y-1">
            {submenu.map((subItem, index) => (
              <Link
                key={index}
                href={subItem.href}
                onClick={() => {
                  // Force close mobile menu for submenu items
                  console.log("Submenu item clicked:", subItem.label);
                  if (onClick) {
                    onClick();
                  }
                }}
                className={cn(
                  "flex items-center gap-3 px-4 py-2 text-sm font-medium rounded-md transition-all cursor-pointer block min-h-[36px] touch-manipulation relative z-50 select-none",
                  location === subItem.href
                    ? "text-white bg-gray-600 shadow-lg"
                    : "text-gray-400 hover:bg-gray-600 hover:text-white hover:shadow-md",
                )}
                style={{
                  WebkitUserSelect: "none",
                  MozUserSelect: "none",
                  msUserSelect: "none",
                  userSelect: "none",
                }}
              >
                {subItem.icon}
                <span>{subItem.label}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Regular navigation item
  return (
    <Link
      href={href!}
      onClick={() => {
        // Force close mobile menu for main navigation items
        logger.navigation("Main nav item clicked:", label);
        if (onClick) {
          onClick();
        }
      }}
      className={cn(
        "flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-md transition-all cursor-pointer block min-h-[44px] touch-manipulation relative z-50 select-none",
        isActive
          ? "text-white bg-gray-700 shadow-lg"
          : "text-gray-300 hover:bg-gray-700 hover:text-white hover:shadow-md",
      )}
      style={{
        WebkitUserSelect: "none",
        MozUserSelect: "none",
        msUserSelect: "none",
        userSelect: "none",
      }}
    >
      {icon}
      <span>{label}</span>
    </Link>
  );
}

function MainLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [legacyExpanded, setLegacyExpanded] = useState(false);
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const profileDialogRef = useRef<ProfileEditDialogRef>(null);
  const { user, logoutMutation } = useAuth();
  const { toast } = useToast();

  // Helper to toggle profile dialog with proper form reset
  // Ensures form is reset synchronously before dialog state changes to prevent flicker
  const toggleProfileDialog = (open: boolean) => {
    if (user && profileDialogRef.current) {
      profileDialogRef.current.reset(user);
    }
    setProfileDialogOpen(open);
  };

  // Check if user is admin
  const isAdmin = user?.role === "admin";

  // Filter navigation items based on admin status
  const filteredNavItems = navItems.filter(
    (item) => !item.adminOnly || isAdmin,
  );

  // Check if any Legacy submenu items are active
  const isLegacyActive =
    location === "/tddf" ||
    location === "/tddf-json" ||
    location.startsWith("/tddf/") ||
    location.startsWith("/tddf-json/");

  // Auto-expand Legacy submenu if any of its items are active
  useEffect(() => {
    if (isLegacyActive) {
      setLegacyExpanded(true);
    }
  }, [isLegacyActive]);

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
      },
    });
  };

  // Mobile navigation
  const MobileNav = () => (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden text-white hover:bg-gray-700 min-h-[44px] min-w-[44px] touch-manipulation"
        >
          <Menu className="h-6 w-6" />
          <span className="sr-only">Toggle menu</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 p-0 bg-gray-800 text-white flex flex-col">
        {/* Header section */}
        <div className="flex h-12 items-center gap-2 px-6 py-6 flex-shrink-0">
          <h2 className="text-lg font-bold text-white">MMS Dashboard</h2>
        </div>

        {/* Scrollable navigation section */}
        <ScrollArea className="flex-1 px-4">
          <nav className="flex flex-col gap-1 pb-4">
            {filteredNavItems.map((item, index) => (
              <NavItem
                key={index}
                icon={item.icon}
                label={item.label}
                href={item.href}
                isActive={
                  item.href
                    ? location === item.href ||
                      (item.href !== "/" &&
                        location.startsWith(item.href + "/"))
                    : false
                }
                onClick={() => {
                  logger.navigation("Mobile nav item clicked:", item.label);
                  // Close the sheet immediately for navigation
                  setOpen(false);
                }}
                submenu={item.submenu}
                isExpanded={
                  item.label === "Legacy" ? legacyExpanded : undefined
                }
                onToggle={
                  item.label === "Legacy"
                    ? () => setLegacyExpanded(!legacyExpanded)
                    : undefined
                }
              />
            ))}
          </nav>
        </ScrollArea>

        {/* Fixed bottom section - User info and Logout (Mobile) */}
        <div className="flex-shrink-0 border-t border-gray-700 px-6 pt-3 pb-6">
          {/* User info and Logout for logged-in users */}
          {user && (
            <>
              <div 
                className="text-gray-300 text-sm mb-2 px-4 mt-3 cursor-pointer hover:bg-gray-700 rounded-md py-2 transition-all group min-h-[44px] touch-manipulation"
                onClick={() => toggleProfileDialog(true)}
                data-testid="button-edit-profile-mobile"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="font-medium">
                      {user.firstName
                        ? `${user.firstName} ${user.lastName || ""}`
                        : user.username}
                    </div>
                    <div className="text-gray-400 text-xs">{user.email}</div>
                  </div>
                  <Edit className="h-4 w-4 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>
              <div
                className="flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-md transition-all cursor-pointer text-gray-300 hover:bg-gray-700 min-h-[44px] touch-manipulation"
                onClick={(e) => {
                  e.preventDefault();
                  handleLogout();
                  setOpen(false);
                }}
                data-testid="button-logout-mobile"
              >
                <LogOut className="h-5 w-5 text-gray-300" />
                <span>Logout</span>
              </div>
            </>
          )}

          {/* Version info */}
          <Link href="/about" onClick={() => setOpen(false)}>
            <div 
              className="mt-4 pt-3 border-t border-gray-700 text-gray-400 text-xs flex items-center justify-between hover:text-gray-300 transition-colors cursor-pointer"
              data-testid="link-version-mobile"
            >
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
                      <p className="text-blue-400 mt-1">Click to view API docs</p>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </Link>
        </div>
      </SheetContent>
    </Sheet>
  );

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 flex-col md:flex border-r bg-gray-800 relative z-50">
        {/* Header section */}
        <div className="flex h-12 items-center px-6 py-6 mb-4">
          <h2 className="text-lg font-bold text-white">MDWS Dashboard</h2>
        </div>

        {/* Scrollable navigation section */}
        <ScrollArea className="flex-1 px-4">
          <nav className="flex flex-col gap-1 px-2 pb-4">
            {filteredNavItems.map((item, index) => (
              <NavItem
                key={index}
                icon={item.icon}
                label={item.label}
                href={item.href}
                isActive={
                  item.href
                    ? location === item.href ||
                      (item.href !== "/" &&
                        location.startsWith(item.href + "/"))
                    : false
                }
                onClick={() => {
                  // Desktop navigation click handler
                  logger.navigation("Desktop nav item clicked:", item.label);
                }}
                submenu={item.submenu}
                isExpanded={
                  item.label === "Legacy" ? legacyExpanded : undefined
                }
                onToggle={
                  item.label === "Legacy"
                    ? () => setLegacyExpanded(!legacyExpanded)
                    : undefined
                }
              />
            ))}
          </nav>
        </ScrollArea>

        {/* Fixed bottom section - User info and Logout */}
        <div className="flex-shrink-0 border-t border-gray-700 px-6 pt-3 pb-6">
          {/* User info and Logout for logged-in users */}
          {user && (
            <>
              <div 
                className="text-gray-300 text-sm mb-2 px-4 mt-3 cursor-pointer hover:bg-gray-700 rounded-md py-2 transition-all group"
                onClick={() => toggleProfileDialog(true)}
                data-testid="button-edit-profile"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="font-medium">
                      {user.firstName
                        ? `${user.firstName} ${user.lastName || ""}`
                        : user.username}
                    </div>
                    <div className="text-gray-400 text-xs">{user.email}</div>
                  </div>
                  <Edit className="h-4 w-4 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>
              <Button
                variant="outline"
                className="w-full justify-start text-gray-300 hover:text-white hover:bg-gray-700"
                onClick={handleLogout}
                disabled={logoutMutation.isPending}
                data-testid="button-logout"
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
            </>
          )}

          {/* Version info */}
          <Link href="/about">
            <div 
              className="mt-4 pt-3 border-t border-gray-700 text-gray-400 text-xs flex items-center justify-between hover:text-gray-300 transition-colors cursor-pointer"
              data-testid="link-version-desktop"
            >
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
                      <p className="text-blue-400 mt-1">Click to view API docs</p>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </Link>
        </div>
      </aside>

      <div className="flex flex-1 flex-col">
        {/* Mobile header */}
        <header className="sticky top-0 z-50 flex h-16 items-center gap-4 border-b bg-gray-800 text-white px-4 md:hidden shadow-sm">
          <MobileNav />
          <h1 className="text-lg font-bold truncate">MDWS Dashboard</h1>
        </header>

        {/* Main content */}
        <main className="flex-1 bg-gray-100 p-6">
          <FallbackStorageAlert />
          {children}
        </main>
      </div>

      {/* Profile Edit Dialog */}
      {user && (
        <ProfileEditDialog
          ref={profileDialogRef}
          open={profileDialogOpen}
          onOpenChange={toggleProfileDialog}
          user={user}
        />
      )}
    </div>
  );
}

export { MainLayout };
export default MainLayout;
