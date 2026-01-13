import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import MainLayout from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, ExternalLink, Activity } from "lucide-react";
import { Link } from "wouter";

interface OrphanTerminal {
  terminalId: string;
  transactionCount: number;
  totalAmount: number;
  firstSeen: string;
  lastSeen: string;
  merchantName?: string;
  mccCode?: string;
}

export default function OrphanTerminalsPage() {
  const [searchFilter, setSearchFilter] = useState("");

  // Fetch orphan terminals (Terminal IDs that exist in TDDF but not in terminals table)
  const { data: orphanTerminals = [], isLoading } = useQuery({
    queryKey: ['/api/tddf/orphan-terminals'],
    queryFn: async () => {
      const response = await fetch('/api/tddf/orphan-terminals', { 
        credentials: 'include' 
      });
      if (!response.ok) throw new Error('Failed to fetch orphan terminals');
      return response.json();
    },
  });

  const filteredTerminals = orphanTerminals.filter((terminal: OrphanTerminal) =>
    terminal.terminalId.toLowerCase().includes(searchFilter.toLowerCase()) ||
    terminal.merchantName?.toLowerCase().includes(searchFilter.toLowerCase()) ||
    terminal.mccCode?.toLowerCase().includes(searchFilter.toLowerCase())
  );

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Orphan Terminals</h1>
            <p className="text-muted-foreground">
              Terminal IDs found in TDDF records but not registered in the terminals database
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-orange-600 border-orange-200 bg-orange-50">
              <Activity className="h-3 w-3 mr-1" />
              {filteredTerminals.length} Orphan Terminals
            </Badge>
          </div>
        </div>

        {/* Search Filter */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Search Orphan Terminals</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by Terminal ID, Merchant Name, or MCC Code..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="pl-10"
              />
            </div>
          </CardContent>
        </Card>

        {/* Orphan Terminals Table */}
        <Card>
          <CardHeader>
            <CardTitle>
              Orphan Terminals ({filteredTerminals.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center py-8">
                <div className="text-muted-foreground">Loading orphan terminals...</div>
              </div>
            ) : filteredTerminals.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {searchFilter ? "No orphan terminals match your search" : "No orphan terminals found"}
              </div>
            ) : (
              <div className="rounded-lg border overflow-hidden">
                <table className="w-full">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left p-3 font-medium">Terminal ID</th>
                      <th className="text-left p-3 font-medium">Merchant Name</th>
                      <th className="text-left p-3 font-medium">MCC</th>
                      <th className="text-right p-3 font-medium">Transactions</th>
                      <th className="text-right p-3 font-medium">Total Amount</th>
                      <th className="text-left p-3 font-medium">First Seen</th>
                      <th className="text-left p-3 font-medium">Last Seen</th>
                      <th className="text-center p-3 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTerminals.map((terminal: OrphanTerminal) => (
                      <tr key={terminal.terminalId} className="border-t hover:bg-muted/25">
                        <td className="p-3">
                          <span className="text-xs font-mono text-orange-600 bg-orange-50 px-2 py-1 rounded border border-orange-200">
                            {terminal.terminalId}
                          </span>
                        </td>
                        <td className="p-3 max-w-48 truncate">
                          {terminal.merchantName || 'N/A'}
                        </td>
                        <td className="p-3 font-mono text-xs">
                          {terminal.mccCode || 'N/A'}
                        </td>
                        <td className="p-3 text-right font-medium">
                          {terminal.transactionCount}
                        </td>
                        <td className="p-3 text-right font-medium">
                          {formatCurrency(terminal.totalAmount)}
                        </td>
                        <td className="p-3 text-sm">
                          {formatDate(terminal.firstSeen)}
                        </td>
                        <td className="p-3 text-sm">
                          {formatDate(terminal.lastSeen)}
                        </td>
                        <td className="p-3 text-center">
                          <Link href={`/orphan-terminals/${terminal.terminalId}`}>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-orange-600 hover:text-orange-800 hover:bg-orange-50"
                            >
                              <ExternalLink className="h-4 w-4 mr-1" />
                              View
                            </Button>
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Summary Card */}
        {filteredTerminals.length > 0 && (
          <Card className="border-orange-200 bg-orange-50">
            <CardContent className="pt-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-orange-800">
                    {filteredTerminals.length}
                  </div>
                  <div className="text-sm text-orange-600">Orphan Terminals</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-orange-800">
                    {filteredTerminals.reduce((sum: number, t: OrphanTerminal) => sum + t.transactionCount, 0)}
                  </div>
                  <div className="text-sm text-orange-600">Total Transactions</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-orange-800">
                    {formatCurrency(filteredTerminals.reduce((sum: number, t: OrphanTerminal) => sum + t.totalAmount, 0))}
                  </div>
                  <div className="text-sm text-orange-600">Total Volume</div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </MainLayout>
  );
}