import React from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DashboardStats as DashboardStatsType } from "@/lib/types";

interface DashboardStatsProps {
  isLoading: boolean;
  stats?: DashboardStatsType;
}

export default function DashboardStats({ isLoading, stats }: DashboardStatsProps) {
  const [, setLocation] = useLocation();
  
  const statCards = [
    {
      title: "Total Merchants",
      value: stats?.totalMerchants || 0,
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
        </svg>
      ),
      bgColor: "bg-blue-500",
      link: "/",
      linkText: "View all",
      onClick: () => setLocation("/")
    },
    {
      title: "New Merchants (30d)",
      value: stats?.newMerchants || 0,
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
        </svg>
      ),
      bgColor: "bg-green-500",
      link: "/exports",
      linkText: "View report",
      onClick: () => setLocation("/exports")
    },
    {
      title: "Transactions (Today)",
      value: stats?.dailyTransactions || 0,
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
        </svg>
      ),
      bgColor: "bg-purple-500",
      link: "/exports",
      linkText: "View details",
      onClick: () => setLocation("/exports")
    },
    {
      title: "Monthly Revenue",
      value: stats ? `$${stats.monthlyRevenue.toLocaleString()}` : "$0",
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      bgColor: "bg-yellow-500",
      link: "/analytics",
      linkText: "View analytics",
      onClick: () => setLocation("/analytics")
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-5 mt-6 sm:grid-cols-2 lg:grid-cols-4">
      {statCards.map((stat, index) => (
        <Card key={index} className="overflow-hidden">
          <CardContent className="p-5">
            <div className="flex items-center">
              <div className={`flex-shrink-0 p-3 text-white rounded-md ${stat.bgColor}`}>
                {stat.icon}
              </div>
              <div className="flex-1 w-0 ml-5">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">{stat.title}</dt>
                  <dd className="text-2xl font-semibold text-gray-900">
                    {isLoading ? (
                      <Skeleton className="h-8 w-24" />
                    ) : (
                      stat.value
                    )}
                  </dd>
                </dl>
              </div>
            </div>
          </CardContent>
          <CardFooter className="px-5 py-3 bg-gray-50">
            <div className="text-sm">
              <a 
                href={stat.link} 
                className="font-medium text-blue-600 hover:text-blue-500 cursor-pointer"
                onClick={(e) => {
                  e.preventDefault();
                  stat.onClick();
                }}
              >
                {stat.linkText}
              </a>
            </div>
          </CardFooter>
        </Card>
      ))}
    </div>
  );
}
