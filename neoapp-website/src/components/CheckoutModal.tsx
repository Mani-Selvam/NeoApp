import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Plus, Minus, Tag, CheckCircle2, ShieldCheck } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useRazorpay } from "@/hooks/useRazorpay";

interface CheckoutModalProps {
  open: boolean;
  onClose: () => void;
  plan: any;
  onSuccess?: () => void;
}

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

export function CheckoutModal({ open, onClose, plan, onSuccess }: CheckoutModalProps) {
  const { token } = useAuth();
  const { toast } = useToast();
  const { checkout, loading: checkoutLoading } = useRazorpay();

  const [adminCount, setAdminCount] = useState(1);
  const [staffCount, setStaffCount] = useState(1);
  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState("");
  
  const [preview, setPreview] = useState<any>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [couponLoading, setCouponLoading] = useState(false);

  // Reset state when modal opens with a new plan
  useEffect(() => {
    if (open && plan) {
      setAdminCount(plan.maxAdmins || 1);
      setStaffCount(plan.maxStaff || 1);
      setCouponCode("");
      setAppliedCoupon("");
      setPreview(null);
    }
  }, [open, plan]);

  // Fetch preview when deps change
  useEffect(() => {
    if (!open || !plan) return;

    const fetchPreview = async () => {
      setLoadingPreview(true);
      try {
        const currentToken = localStorage.getItem("neoapp_token") || token;
        const res = await fetch(`${API_BASE}/users/billing/checkout/preview`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${currentToken}`,
          },
          body: JSON.stringify({
            planId: plan._id,
            adminCount,
            staffCount,
            couponCode: appliedCoupon,
          }),
        });
        const data = await res.json();
        if (res.ok) {
          setPreview(data);
        } else {
          // If coupon fails, clear it and alert
          if (appliedCoupon && data.message && data.message.toLowerCase().includes("coupon")) {
             toast({ title: "Invalid Coupon", description: data.message, variant: "destructive" });
             setAppliedCoupon("");
          } else {
             toast({ title: "Error", description: data.message || "Failed to load preview", variant: "destructive" });
          }
        }
      } catch (err) {
        console.error("Preview fetch error:", err);
      } finally {
        setLoadingPreview(false);
        setCouponLoading(false);
      }
    };

    const timer = setTimeout(() => {
      fetchPreview();
    }, 300);

    return () => clearTimeout(timer);
  }, [open, plan, adminCount, staffCount, appliedCoupon, token, toast]);

  const handleApplyCoupon = () => {
    if (!couponCode.trim()) {
      setAppliedCoupon("");
      return;
    }
    setCouponLoading(true);
    setAppliedCoupon(couponCode.trim().toUpperCase());
  };

  const handleCheckout = async () => {
    if (!plan) return;
    const success = await checkout(plan._id, adminCount, staffCount, appliedCoupon);
    if (success) {
      onSuccess?.();
      onClose();
    }
  };

  if (!plan) return null;

  return (
    <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
      <DialogContent className="sm:max-w-[500px] p-0 overflow-hidden bg-background border-border shadow-2xl">
        <DialogHeader className="p-6 pb-0">
          <DialogTitle className="text-2xl font-bold flex items-center gap-2">
            Checkout <span className="text-primary font-display">{plan.name}</span>
          </DialogTitle>
          <DialogDescription>
            Configure your team size and confirm your plan details.
          </DialogDescription>
        </DialogHeader>

        <div className="p-6 pt-4 space-y-6 max-h-[70vh] overflow-y-auto">
          {/* Team Allocation */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Team Allocation</h3>
            
            {/* Admin Counter */}
            <div className="flex items-center justify-between p-4 rounded-2xl border border-border bg-card">
              <div>
                <div className="font-semibold text-foreground">Admin Accounts</div>
                <div className="text-xs text-muted-foreground mt-1">Includes {plan.maxAdmins || 1} with this plan</div>
                {plan.extraAdminPrice > 0 && (
                  <div className="text-xs font-medium text-primary mt-1">+${plan.extraAdminPrice} per extra</div>
                )}
              </div>
              <div className="flex items-center gap-3">
                <Button 
                  variant="outline" 
                  size="icon" 
                  className="h-8 w-8 rounded-full"
                  disabled={adminCount <= (plan.maxAdmins || 1)}
                  onClick={() => setAdminCount(prev => Math.max(plan.maxAdmins || 1, prev - 1))}
                >
                  <Minus className="w-4 h-4" />
                </Button>
                <span className="w-6 text-center font-semibold">{adminCount}</span>
                <Button 
                  variant="outline" 
                  size="icon" 
                  className="h-8 w-8 rounded-full"
                  onClick={() => setAdminCount(prev => prev + 1)}
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Staff Counter */}
            <div className="flex items-center justify-between p-4 rounded-2xl border border-border bg-card">
              <div>
                <div className="font-semibold text-foreground">Staff Accounts</div>
                <div className="text-xs text-muted-foreground mt-1">Includes {plan.maxStaff || 1} with this plan</div>
                {plan.extraStaffPrice > 0 && (
                  <div className="text-xs font-medium text-primary mt-1">+${plan.extraStaffPrice} per extra</div>
                )}
              </div>
              <div className="flex items-center gap-3">
                <Button 
                  variant="outline" 
                  size="icon" 
                  className="h-8 w-8 rounded-full"
                  disabled={staffCount <= (plan.maxStaff || 1)}
                  onClick={() => setStaffCount(prev => Math.max(plan.maxStaff || 1, prev - 1))}
                >
                  <Minus className="w-4 h-4" />
                </Button>
                <span className="w-6 text-center font-semibold">{staffCount}</span>
                <Button 
                  variant="outline" 
                  size="icon" 
                  className="h-8 w-8 rounded-full"
                  onClick={() => setStaffCount(prev => prev + 1)}
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* Coupon */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Discount <span className="lowercase text-xs font-normal opacity-70">(Optional)</span></h3>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input 
                  placeholder="Enter coupon code (Optional)" 
                  className="pl-9 bg-card"
                  value={couponCode}
                  onChange={(e) => setCouponCode(e.target.value)}
                  disabled={!!appliedCoupon || couponLoading}
                />
              </div>
              {appliedCoupon ? (
                <Button variant="outline" className="text-rose-500 hover:text-rose-600 hover:bg-rose-50" onClick={() => { setAppliedCoupon(""); setCouponCode(""); }}>
                  Remove
                </Button>
              ) : (
                <Button variant="secondary" onClick={handleApplyCoupon} disabled={!couponCode.trim() || couponLoading}>
                  {couponLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Apply"}
                </Button>
              )}
            </div>
          </div>

          {/* Billing Breakdown */}
          <div className="p-5 rounded-2xl bg-primary/5 border border-primary/10 space-y-3">
            <h3 className="text-sm font-semibold text-primary uppercase tracking-wider mb-2">Billing Breakdown</h3>
            
            {loadingPreview ? (
              <div className="flex justify-center py-4">
                <Loader2 className="w-6 h-6 animate-spin text-primary/50" />
              </div>
            ) : preview?.pricing ? (
              <div className="space-y-2 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>Subtotal</span>
                  <span>₹{preview.pricing.originalPrice}</span>
                </div>
                {preview.pricing.discountAmount > 0 && (
                  <div className="flex justify-between text-emerald-500 font-medium">
                    <span>Discount {appliedCoupon ? `(${appliedCoupon})` : ''}</span>
                    <span>-₹{preview.pricing.discountAmount}</span>
                  </div>
                )}
                <div className="border-t border-border/50 pt-2 mt-2 flex justify-between font-bold text-lg text-foreground">
                  <span>Total</span>
                  <span>₹{preview.pricing.finalPrice}</span>
                </div>
              </div>
            ) : (
              <div className="text-center text-sm text-muted-foreground py-2">
                Unable to load preview
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-6 border-t border-border bg-card">
          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground mb-4">
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            <span>Secure encryption via Razorpay</span>
          </div>
          <Button 
            className="w-full h-12 text-base font-semibold rounded-full" 
            disabled={loadingPreview || checkoutLoading || !preview?.pricing}
            onClick={handleCheckout}
          >
            {checkoutLoading ? (
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
            ) : null}
            {preview?.pricing ? `Pay ₹${preview.pricing.finalPrice}` : "Continue to payment"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
