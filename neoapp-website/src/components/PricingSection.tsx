import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/AuthContext";

interface PricingSectionProps {
  onCheckout?: (plan: any) => void;
}

export function PricingSection({ onCheckout }: PricingSectionProps) {
  const [plans, setPlans] = useState<any[]>([]);
  const [activePlanId, setActivePlanId] = useState<string | null>(null);
  const { token, isAuthenticated } = useAuth();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
    const API_PUBLIC_BASE = API_BASE.replace(/\/api$/, "");
    
    // Fetch all public plans
    fetch(`${API_PUBLIC_BASE}/public/forms/plans`)
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          // Sort plans by base price
          const sortedPlans = (data.plans || []).sort((a: any, b: any) => a.basePrice - b.basePrice);
          setPlans(sortedPlans);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));

    // Fetch user's current plan if logged in
    if (isAuthenticated && token) {
      fetch(`${API_BASE}/users/company/current-plan`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      .then(res => res.json())
      .then(data => {
        if (data.success && data.plan) {
          setActivePlanId(data.plan._id);
        }
      })
      .catch(console.error);
    }
  }, [isAuthenticated, token]);

  return (
    <section id="pricing" className="py-24 bg-background">
      <div className="container mx-auto px-4 md:px-6">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-sm font-semibold text-primary uppercase tracking-wider mb-2">Pricing</h2>
          <h3 className="text-3xl md:text-5xl font-bold tracking-tight mb-4">Transparent plans for growing teams.</h3>
          <p className="text-lg text-muted-foreground">
            No hidden fees. Scale your CRM as your operations grow.
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center items-center py-20">
            <Loader2 className="w-12 h-12 animate-spin text-primary" />
          </div>
        ) : plans.length === 0 ? (
          <div className="text-center text-muted-foreground py-20">
            No plans available currently. Please check back later.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {plans.map((dbPlan, index) => {
              const isActive = activePlanId && activePlanId === dbPlan._id;
              const isOther = activePlanId && !isActive;
              
              // Dynamically highlight the PRO plan, or the most expensive plan if PRO doesn't exist
              const isHighlight = dbPlan.code === 'PRO' || (index === plans.length - 1 && plans.length > 1);

              const displayTrial = dbPlan.trialDays > 0 ? `${dbPlan.trialDays}-day trial` : "No trial";
              const displayLimits = `${dbPlan.maxAdmins} Admin${dbPlan.maxAdmins > 1 ? 's' : ''} • ${dbPlan.maxStaff} Staff`;
              
              let displayExtra = "";
              if (dbPlan.extraAdminPrice > 0 || dbPlan.extraStaffPrice > 0) {
                displayExtra = `Extra admin $${dbPlan.extraAdminPrice || 0}/mo, staff $${dbPlan.extraStaffPrice || 0}/mo`;
              }

              return (
              <motion.div
                key={dbPlan._id}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className={`rounded-3xl p-8 flex flex-col transition-all duration-300 ${
                  isOther ? "opacity-40 grayscale pointer-events-none" : ""
                } ${isHighlight
                    ? "bg-primary text-primary-foreground shadow-2xl shadow-primary/20 scale-105 z-10 relative"
                    : "glass-card"
                  }`}
              >
                <div className="mb-8">
                  <h4 className={`text-xl font-semibold mb-2 ${isHighlight ? "text-primary-foreground" : ""}`}>{dbPlan.name}</h4>
                  <div className="flex items-baseline gap-1 mt-6">
                    <span className="text-3xl font-bold">$</span>
                    <span className="text-5xl font-bold tracking-tight font-display">{dbPlan.basePrice}</span>
                    <span className={`text-sm ${isHighlight ? "text-primary-foreground/80" : "text-muted-foreground"}`}>/month</span>
                  </div>
                  <div className="mt-2 text-sm font-medium">
                    {displayTrial}
                  </div>
                </div>

                <div className={`py-4 border-y border-dashed mb-6 ${isHighlight ? "border-primary-foreground/20" : "border-border"}`}>
                  <div className="font-semibold text-sm mb-1">{displayLimits}</div>
                  {displayExtra && <div className={`text-xs ${isHighlight ? "text-primary-foreground/70" : "text-muted-foreground"}`}>{displayExtra}</div>}
                </div>

                <ul className="space-y-4 mb-8 flex-1">
                  {(dbPlan.features || []).map((feature: string, i: number) => (
                    <li key={i} className="flex items-start gap-3 text-sm">
                      <Check className={`w-5 h-5 shrink-0 ${isHighlight ? "text-primary-foreground" : "text-primary"}`} />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                <Button
                  variant={isHighlight ? "secondary" : "default"}
                  disabled={isActive}
                  className={`w-full rounded-full h-12 text-base font-semibold ${isActive ? "opacity-100 bg-green-500 text-white hover:bg-green-600" : ""} ${!isActive && isHighlight ? "text-primary hover:bg-white" : ""
                    }`}
                  onClick={() => onCheckout && onCheckout(dbPlan)}
                >
                  {isActive ? "Current Plan" : "Select Plan"}
                </Button>
              </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
