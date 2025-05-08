import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { 
  BarChart3, 
  Home, 
  Settings, 
  FileText, 
  UploadCloud, 
  Users, 
  Menu,
  DollarSign
} from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

interface NavItemProps {
  icon: React.ReactNode;
  label: string;
  href: string;
  isActive: boolean;
  onClick?: () => void;
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
              {navItems.map((item, index) => (
                <NavItem
                  key={index}
                  icon={item.icon}
                  label={item.label}
                  href={item.href}
                  isActive={location === item.href}
                  onClick={() => setOpen(false)}
                />
              ))}
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
            {navItems.map((item, index) => (
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
      </aside>
      
      <div className="flex flex-1 flex-col">
        {/* Mobile header */}
        <header className="sticky top-0 z-10 flex h-16 items-center gap-4 border-b bg-gray-800 text-white px-6 md:hidden">
          <MobileNav />
          <h1 className="text-xl font-bold">MMS Dashboard</h1>
        </header>
        
        {/* Main content */}
        <main className="flex-1 bg-gray-100 p-6">{children}</main>
      </div>
    </div>
  );
}