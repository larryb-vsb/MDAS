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
    // Primary Stats Row
    {
      title: "Total Merchants",
      value: stats?.totalMerchants || 0,
      secondaryValue: stats ? `${stats.activeRate.toFixed(1)}% Active` : null,
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
        </svg>
      ),
      bgColor: "bg-blue-600",
      link: "/merchants",
      linkText: "View all",
      onClick: () => setLocation("/merchants")
    },
    {
      title: "New Merchants (30d)",
      value: stats?.newMerchants || 0,
      secondaryValue: stats?.totalMerchants ? `${((stats.newMerchants / stats.totalMerchants) * 100).toFixed(1)}% Growth` : null,
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0012 0v1H3v-1z" />
        </svg>
      ),
      bgColor: "bg-green-600",
      link: "/merchants",
      linkText: "View report",
      onClick: () => setLocation("/merchants")
    },
    {
      title: "Monthly Transactions",
      value: stats?.totalTransactions || 0,
      secondaryValue: stats && stats.transactionGrowth !== 0 ? (
        <span className={stats.transactionGrowth > 0 ? "text-green-600" : "text-red-600"}>
          {stats.transactionGrowth > 0 ? "↑" : "↓"} {Math.abs(stats.transactionGrowth).toFixed(1)}%
        </span>
      ) : null,
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
        </svg>
      ),
      bgColor: "bg-purple-600",
      link: "/transactions",
      linkText: "View details",
      onClick: () => setLocation("/transactions")
    },
    {
      title: "Monthly Revenue",
      value: stats ? `$${stats.monthlyRevenue.toLocaleString()}` : "$0",
      secondaryValue: stats && stats.revenueGrowth !== 0 ? (
        <span className={stats.revenueGrowth > 0 ? "text-green-600" : "text-red-600"}>
          {stats.revenueGrowth > 0 ? "↑" : "↓"} {Math.abs(stats.revenueGrowth).toFixed(1)}%
        </span>
      ) : null,
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      bgColor: "bg-yellow-600",
      link: "/analytics",
      linkText: "View analytics",
      onClick: () => setLocation("/analytics")
    },
    // Secondary Stats Row 
    {
      title: "Today's Transactions",
      value: stats?.dailyTransactions || 0,
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ),
      bgColor: "bg-indigo-600",
      link: "/transactions",
      linkText: "View today",
      onClick: () => setLocation("/transactions")
    },
    {
      title: "Avg Transaction Value",
      value: stats ? `$${stats.avgTransactionValue.toLocaleString()}` : "$0",
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
      ),
      bgColor: "bg-pink-600",
      link: "/analytics",
      linkText: "View trend",
      onClick: () => setLocation("/analytics")
    },
    {
      title: "Total Revenue",
      value: stats ? `$${stats.totalRevenue.toLocaleString()}` : "$0",
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
      bgColor: "bg-emerald-600",
      link: "/analytics",
      linkText: "View report",
      onClick: () => setLocation("/analytics")
    },
    {
      title: "Total Transactions",
      value: stats?.totalTransactions || 0,
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
      ),
      bgColor: "bg-amber-600",
      link: "/transactions",
      linkText: "View all",
      onClick: () => setLocation("/transactions")
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 mt-6 sm:grid-cols-2 lg:grid-cols-4">
      {/* Primary Stats Row */}
      <div className="col-span-1 sm:col-span-2 lg:col-span-4">
        <h3 className="text-lg font-medium text-gray-800 mb-2">Key Performance Indicators</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {statCards.slice(0, 4).map((stat, index) => (
            <Card key={index} className="overflow-hidden shadow-sm hover:shadow-md transition-shadow">
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
                      {!isLoading && stat.secondaryValue && (
                        <dd className="text-sm font-medium mt-1">
                          {stat.secondaryValue}
                        </dd>
                      )}
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
      </div>
      
      {/* Secondary Stats Row */}
      <div className="col-span-1 sm:col-span-2 lg:col-span-4 mt-2">
        <h3 className="text-lg font-medium text-gray-800 mb-2">Additional Metrics</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {statCards.slice(4).map((stat, index) => (
            <Card key={index} className="overflow-hidden shadow-sm hover:shadow-md transition-shadow">
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
                      {!isLoading && stat.secondaryValue && (
                        <dd className="text-sm font-medium mt-1">
                          {stat.secondaryValue}
                        </dd>
                      )}
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
      </div>
    </div>
  );
}