import React from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { Database, Shield, ArchiveRestore } from "lucide-react";

interface SidebarProps {
  isVisible?: boolean;
  className?: string;
}

export default function Sidebar({ isVisible = true, className }: SidebarProps) {
  const [location] = useLocation();
  const { user } = useAuth();
  
  // Check if user is an admin
  console.log("Current user:", user);
  console.log("User role:", user?.role);
  
  // Temporarily set all users as admin for testing
  const isAdmin = true; // TEMPORARY: Will fix properly later
  console.log("isAdmin set to:", isAdmin);

  // Define the type for nav items
  interface NavItem {
    name: string;
    href: string;
    icon: React.ReactNode;
    adminOnly?: boolean;
  }
  
  // Create the navigation items array
  const navItems: (NavItem | false)[] = [
    {
      name: "Merchants",
      href: "/",
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
        </svg>
      ),
    },
    {
      name: "Transactions",
      href: "/transactions",
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    {
      name: "Analytics",
      href: "/analytics",
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
    },
    {
      name: "Uploads",
      href: "/uploads",
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
        </svg>
      ),
    },
    {
      name: "Exports",
      href: "/exports",
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
    },
    {
      name: "Settings",
      href: "/settings",
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
    },
    // Only show Backups link for admin users - forcing to true for now
    {
      name: "Backups",
      href: "/backups",
      icon: <ArchiveRestore className="w-5 h-5 mr-3" />,
      adminOnly: true,
    },
  ];

  // Debug nav items
  console.log("Nav items before filter:", navItems);
  const filteredNavItems = navItems.filter((item): item is NavItem => Boolean(item));
  console.log("Nav items after filter:", filteredNavItems);

  return (
    <div className={cn(isVisible ? "block" : "hidden", className)}>
      <div className="flex flex-col w-64 bg-gray-800">
        <div className="flex items-center h-16 px-6 bg-gray-900">
          <h1 className="text-lg font-bold text-white">MMS Dashboard</h1>
        </div>
        <div className="flex flex-col flex-grow px-4 py-4 overflow-y-auto">
          <nav className="flex-1 space-y-2">
            {filteredNavItems.map((item) => (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  "flex items-center px-4 py-3 text-sm font-medium rounded-md",
                  location === item.href
                    ? "text-white bg-gray-700"
                    : "text-gray-300 hover:bg-gray-700"
                )}
              >
                {item.icon}
                {item.name}
              </Link>
            ))}
          </nav>

          <div className="mt-auto">
            <div className="px-4 py-3 mt-6 bg-gray-700 rounded-md">
              <div className="flex items-center">
                <div className="flex items-center justify-center w-10 h-10 bg-gray-500 rounded-full">
                  <span className="text-sm font-medium text-white">AU</span>
                </div>
                <div className="ml-3">
                  <p className="text-sm font-medium text-white">Admin User</p>
                  <p className="text-xs text-gray-300">admin@example.com</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
