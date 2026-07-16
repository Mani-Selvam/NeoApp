import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Activity, PieChart as PieChartIcon } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend
} from "recharts";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000/api".replace(/\/api$/, "");

interface ReportsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ReportsModal({ isOpen, onClose }: ReportsModalProps) {
  const [loading, setLoading] = useState(true);
  const [reportData, setReportData] = useState<any>(null);
  const { token } = useAuth();

  useEffect(() => {
    if (isOpen) {
      fetchReports();
    }
  }, [isOpen]);

  const fetchReports = async () => {
    setLoading(true);
    try {
      const currentToken = localStorage.getItem("neoapp_token") || token;
      const res = await fetch(`${API_BASE}/enquiries/meta/report-summary`, {
        headers: {
          Authorization: `Bearer ${currentToken}`
        }
      });
      const data = await res.json();
      setReportData(data);
    } catch (err) {
      console.error("Failed to fetch reports", err);
    } finally {
      setLoading(false);
    }
  };

  const getBarData = () => {
    if (!reportData) return [];
    return [
      { name: "Total Leads", count: reportData.totalEnquiries || 0 },
      { name: "Converted", count: reportData.convertedEnquiries || 0 }
    ];
  };

  const getPieData = () => {
    if (!reportData) return [];
    return [
      { name: "Pending", value: reportData.pendingFollowUps || 0 },
      { name: "Missed", value: reportData.missedFollowUps || 0 }
    ];
  };

  const COLORS = ["#3b82f6", "#ef4444"]; // Blue for Pending, Red for Missed

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl bg-card/95 backdrop-blur-3xl border-border/50 rounded-3xl p-6 shadow-2xl">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-3">
            <Activity className="w-6 h-6 text-primary" />
            Performance Reports
          </DialogTitle>
          <DialogDescription className="text-muted-foreground pt-1">
            Real-time analytics on your leads and follow-ups.
          </DialogDescription>
        </DialogHeader>

        <div className="py-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <Loader2 className="w-8 h-8 animate-spin mb-4 text-primary" />
              <p>Aggregating report data...</p>
            </div>
          ) : !reportData ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <p>Failed to load data. Please try again.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Bar Chart: Leads */}
              <div className="bg-muted/10 p-4 rounded-2xl border border-border/50 shadow-sm">
                <h3 className="text-sm font-semibold mb-6 flex items-center gap-2">
                  <PieChartIcon className="w-4 h-4 text-primary" /> 
                  Lead Conversion
                </h3>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={getBarData()}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#ffffff1a" vertical={false} />
                      <XAxis dataKey="name" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                      <Tooltip 
                        cursor={{fill: 'transparent'}}
                        contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                        itemStyle={{ color: 'hsl(var(--foreground))' }}
                      />
                      <Bar dataKey="count" fill="currentColor" className="fill-primary" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Pie Chart: Follow Ups */}
              <div className="bg-muted/10 p-4 rounded-2xl border border-border/50 shadow-sm">
                <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                  <PieChartIcon className="w-4 h-4 text-primary" /> 
                  Follow-up Status
                </h3>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={getPieData()}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={70}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {getPieData().map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip 
                        contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                        itemStyle={{ color: 'hsl(var(--foreground))' }}
                      />
                      <Legend verticalAlign="bottom" height={36} iconType="circle" />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end pt-2 border-t border-border/50">
          <Button variant="ghost" onClick={onClose} className="rounded-xl px-6">
            Close Reports
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
