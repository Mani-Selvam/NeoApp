import React, { useEffect, useState } from "react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { useAuth } from "@/lib/AuthContext";
import { useLocation } from "wouter";
import { Loader2, Mic, Activity, Clock, Server, CheckCircle2, AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TopupModal } from "@/components/TopupModal";
import { ActivityFeedModal } from "@/components/ActivityFeedModal";
import { ReportsModal } from "@/components/ReportsModal";
import { useToast } from "@/hooks/use-toast";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000/api".replace(/\/api$/, "");

export default function Dashboard() {
  const { isAuthenticated, token, user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [isTopupOpen, setIsTopupOpen] = useState(false);
  const [isActivityOpen, setIsActivityOpen] = useState(false);
  const [isReportsOpen, setIsReportsOpen] = useState(false);
  const [defaultTopupTab, setDefaultTopupTab] = useState<"Admin" | "Staff" | "AIVoice">("Staff");
  
  // Dashboard state
  const [usageData, setUsageData] = useState({ limit: 0, used: 0, remaining: 0 });
  const [currentPlan, setCurrentPlan] = useState<any>(null);

  useEffect(() => {
    // Redirect if not logged in after check
    const timer = setTimeout(() => {
      if (!isAuthenticated) {
        setLocation("/");
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, [isAuthenticated, setLocation]);

  useEffect(() => {
    if (isAuthenticated && token) {
      fetchDashboardData();
    }
  }, [isAuthenticated, token]);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      // 1. Fetch Plan
      const planRes = await fetch(`${API_BASE}/users/company/current-plan`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const planData = await planRes.json();
      if (planData.success) {
        setCurrentPlan(planData.plan);
      }

      // 2. Fetch AI Usage Limit
      const usageRes = await fetch(`${API_BASE}/assistant/usage`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const usageJson = await usageRes.json();
      if (usageJson.success) {
        setUsageData(usageJson.usage);
      }
    } catch (err) {
      console.error("Failed to load dashboard data", err);
    } finally {
      setLoading(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const usedPct = usageData.limit > 0 ? Math.min(100, Math.round((usageData.used / usageData.limit) * 100)) : 0;
  const isLow = usageData.remaining <= 100 || usageData.used >= usageData.limit;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <Navbar onOpenModal={() => {}} onOpenAuthModal={() => {}} />
      
      <main className="flex-1 container mx-auto px-4 md:px-6 pt-32 pb-24">
        <div className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-2">Welcome, {user?.name || 'User'}</h1>
          <p className="text-muted-foreground">Manage your CRM account and view your AI limits.</p>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
            <p className="text-muted-foreground">Loading your dashboard...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
            
            {/* Left Column: Plan Details */}
            <div className="md:col-span-5 lg:col-span-4 space-y-6">
              <div className="glass-card rounded-3xl p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="font-semibold text-lg flex items-center gap-2">
                    <Server className="w-5 h-5 text-primary" />
                    Current Plan
                  </h2>
                  <span className="px-3 py-1 bg-primary/10 text-primary text-xs font-medium rounded-full">
                    Active
                  </span>
                </div>
                
                <div className="mb-6">
                  <h3 className="text-3xl font-bold font-display">{currentPlan?.name || "Free Trial"}</h3>
                  <p className="text-muted-foreground mt-1 text-sm">
                    Your company is currently on the {currentPlan?.tier || 'starter'} tier.
                  </p>
                </div>

                <div className="space-y-3 mb-6">
                  <div className="flex justify-between items-center text-sm py-2 border-b border-border/50">
                    <span className="text-muted-foreground">Max Admins</span>
                    <span className="font-medium">{currentPlan?.maxAdmins || 1}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm py-2 border-b border-border/50">
                    <span className="text-muted-foreground">Max Staff</span>
                    <span className="font-medium">{currentPlan?.maxStaff || 1}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm py-2 border-b border-border/50">
                    <span className="text-muted-foreground">AI Voice</span>
                    <span className="font-medium">{currentPlan?.aiVoiceEnabled ? 'Enabled' : 'Disabled'}</span>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <Button className="w-full rounded-xl" variant="outline" onClick={() => { window.location.href = import.meta.env.BASE_URL + '#pricing'; }}>
                    Upgrade Plan
                  </Button>
                  <Button className="w-full rounded-xl" variant="secondary" onClick={() => { setDefaultTopupTab("Staff"); setIsTopupOpen(true); }}>
                    Buy More Slots
                  </Button>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="glass-card rounded-3xl p-6">
                <h2 className="font-semibold text-lg mb-4">Quick Actions</h2>
                <div className="space-y-2">
                  <Button 
                    variant="ghost" 
                    className="w-full justify-start rounded-lg text-muted-foreground hover:text-foreground"
                    onClick={() => setIsReportsOpen(true)}
                  >
                    <Activity className="w-4 h-4 mr-3" /> View Reports
                  </Button>
                  <Button 
                    variant="ghost" 
                    className="w-full justify-start rounded-lg text-muted-foreground hover:text-foreground"
                    onClick={() => setIsActivityOpen(true)}
                  >
                    <Clock className="w-4 h-4 mr-3" /> Recent Activity
                  </Button>
                </div>
              </div>
            </div>

            {/* Right Column: AI Usage */}
            <div className="md:col-span-7 lg:col-span-8">
              <div className="glass-card rounded-3xl p-6 md:p-8 h-full">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
                  <div>
                    <h2 className="text-2xl font-bold flex items-center gap-2">
                      <Mic className="w-6 h-6 text-indigo-500" />
                      AI Voice Assistant
                    </h2>
                    <p className="text-muted-foreground mt-1">Monitor your usage limits and quota.</p>
                  </div>
                  <Button variant="outline" size="sm" className="rounded-full" onClick={fetchDashboardData}>
                    <RefreshCw className="w-4 h-4 mr-2" /> Refresh
                  </Button>
                </div>

                {/* Main Stats Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
                  <div className="bg-primary/5 border border-primary/10 rounded-2xl p-5">
                    <div className="text-sm font-medium text-muted-foreground mb-1">Yearly Limit</div>
                    <div className="text-3xl font-bold">{usageData.limit}</div>
                  </div>
                  <div className="bg-orange-500/5 border border-orange-500/10 rounded-2xl p-5">
                    <div className="text-sm font-medium text-orange-600/80 dark:text-orange-400 mb-1">Used Requests</div>
                    <div className="text-3xl font-bold text-orange-600 dark:text-orange-500">{usageData.used}</div>
                  </div>
                  <div className="bg-green-500/5 border border-green-500/10 rounded-2xl p-5">
                    <div className="text-sm font-medium text-green-600/80 dark:text-green-400 mb-1">Remaining</div>
                    <div className="text-3xl font-bold text-green-600 dark:text-green-500">{usageData.remaining}</div>
                  </div>
                </div>

                {/* Progress Section */}
                <div className="bg-card border border-border rounded-2xl p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold">Usage Progress</h3>
                    <span className="text-sm font-medium text-muted-foreground">{usedPct}% Used</span>
                  </div>
                  
                  <div className="h-3 w-full bg-secondary rounded-full overflow-hidden mb-4">
                    <div 
                      className={`h-full rounded-full transition-all duration-1000 ${isLow ? 'bg-destructive' : 'bg-primary'}`}
                      style={{ width: `${usedPct}%` }}
                    />
                  </div>
                  
                  {isLow ? (
                    <div className="flex items-start gap-3 bg-destructive/10 text-destructive p-4 rounded-xl text-sm">
                      <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-semibold">Running low on requests!</span>
                        <p className="mt-1 opacity-90">You have consumed most of your AI voice requests. Consider purchasing a top-up to avoid service interruption.</p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-green-600 dark:text-green-500 text-sm">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Your quota is healthy.</span>
                    </div>
                  )}
                </div>

                {/* Top Up Section */}
                {isLow && (
                  <div className="mt-8 border-t border-border pt-8">
                    <h3 className="font-semibold mb-4 text-lg">Top Up Requests</h3>
                    <div className="flex flex-col sm:flex-row items-center justify-between bg-primary/5 rounded-2xl p-4 md:p-6 border border-primary/10 gap-4">
                      <div>
                        <div className="font-semibold text-primary">Need more requests?</div>
                        <div className="text-sm text-muted-foreground">Get 1000 extra requests instantly for just ₹500.</div>
                      </div>
                      <Button 
                        className="rounded-xl shrink-0 w-full sm:w-auto"
                        onClick={() => { setDefaultTopupTab("AIVoice"); setIsTopupOpen(true); }}
                      >
                        Purchase Top-up
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>

          </div>
        )}
      </main>
      
      <Footer />

      <TopupModal 
        isOpen={isTopupOpen} 
        onClose={() => setIsTopupOpen(false)} 
        currentPlan={currentPlan} 
        defaultTab={defaultTopupTab}
      />
      <ActivityFeedModal 
        isOpen={isActivityOpen} 
        onClose={() => setIsActivityOpen(false)} 
      />
      <ReportsModal 
        isOpen={isReportsOpen} 
        onClose={() => setIsReportsOpen(false)} 
      />
    </div>
  );
}
