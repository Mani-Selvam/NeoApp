import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, UserPlus, ShieldPlus, Mic, Clock, Activity } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000/api".replace(/\/api$/, "");

interface ActivityFeedModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ActivityFeedModal({ isOpen, onClose }: ActivityFeedModalProps) {
  const [loading, setLoading] = useState(true);
  const [activities, setActivities] = useState<any[]>([]);
  const { token } = useAuth();

  useEffect(() => {
    if (isOpen) {
      fetchActivity();
    }
  }, [isOpen]);

  const fetchActivity = async () => {
    setLoading(true);
    try {
      const currentToken = localStorage.getItem("neoapp_token") || token;
      const res = await fetch(`${API_BASE}/dashboard/recent-activity`, {
        headers: {
          Authorization: `Bearer ${currentToken}`
        }
      });
      const data = await res.json();
      if (data.success) {
        setActivities(data.activity);
      }
    } catch (err) {
      console.error("Failed to fetch activity", err);
    } finally {
      setLoading(false);
    }
  };

  const renderIcon = (iconName: string, className: string) => {
    switch (iconName) {
      case "UserPlus": return <UserPlus className={`w-5 h-5 ${className}`} />;
      case "ShieldPlus": return <ShieldPlus className={`w-5 h-5 ${className}`} />;
      case "Mic": return <Mic className={`w-5 h-5 ${className}`} />;
      default: return <Activity className={`w-5 h-5 ${className}`} />;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md bg-card/95 backdrop-blur-3xl border-border/50 rounded-3xl p-0 shadow-2xl overflow-hidden max-h-[85vh] flex flex-col">
        <div className="p-6 pb-4 border-b border-border/50 bg-muted/10 sticky top-0 z-10">
          <DialogTitle className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-3">
            <Clock className="w-6 h-6 text-primary" />
            Recent Activity
          </DialogTitle>
          <DialogDescription className="text-muted-foreground pt-2">
            The latest events and transactions for your company.
          </DialogDescription>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="w-8 h-8 animate-spin mb-4 text-primary" />
              <p>Fetching latest activity...</p>
            </div>
          ) : activities.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground text-center">
              <div className="w-16 h-16 bg-muted/20 rounded-full flex items-center justify-center mb-4">
                <Activity className="w-8 h-8 opacity-50" />
              </div>
              <p className="font-medium text-foreground">No recent activity</p>
              <p className="text-sm mt-1">Your timeline will populate as events occur.</p>
            </div>
          ) : (
            <div className="relative border-l-2 border-muted ml-3 space-y-8 pb-4">
              {activities.map((item, index) => (
                <div key={item.id || index} className="relative pl-6">
                  {/* Timeline Dot */}
                  <div className={`absolute -left-[17px] top-1 w-8 h-8 rounded-full flex items-center justify-center border-4 border-card shadow-sm ${item.color.split(' ')[0]}`}>
                    {renderIcon(item.icon, item.color.split(' ')[1])}
                  </div>
                  
                  {/* Content */}
                  <div className="bg-muted/10 border border-border/40 rounded-2xl p-4 shadow-sm hover:shadow-md hover:bg-muted/20 transition-all">
                    <div className="flex justify-between items-start gap-4 mb-1">
                      <h4 className="font-semibold text-foreground text-sm">{item.title}</h4>
                      <span className="text-[11px] font-medium text-muted-foreground shrink-0 mt-0.5 bg-background px-2 py-0.5 rounded-full border border-border/50">
                        {new Date(item.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">{item.description}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-border/50 bg-background/50 sticky bottom-0">
          <Button variant="ghost" onClick={onClose} className="w-full rounded-xl hover:bg-muted">
            Close Timeline
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
