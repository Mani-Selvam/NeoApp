import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Minus, Plus, Loader2, Users, ShieldAlert } from "lucide-react";
import { useTopupRazorpay } from "@/hooks/useTopupRazorpay";

interface TopupModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentPlan: any;
  defaultTab?: "Admin" | "Staff" | "AIVoice";
}

export function TopupModal({ isOpen, onClose, currentPlan, defaultTab = "Staff" }: TopupModalProps) {
  const [type, setType] = useState<"Admin" | "Staff" | "AIVoice">(defaultTab);
  const [quantity, setQuantity] = useState(1);
  const { checkoutTopup, loading } = useTopupRazorpay();

  useEffect(() => {
    if (isOpen) {
      setType(defaultTab);
      setQuantity(1);
    }
  }, [isOpen, defaultTab]);

  const extraAdminPrice = currentPlan?.extraAdminPrice || 10;
  const extraStaffPrice = currentPlan?.extraStaffPrice || 5;
  const extraAIVoicePrice = currentPlan?.aiVoiceExtraPrice || 500;

  const unitPrice = type === "Admin" ? extraAdminPrice : type === "Staff" ? extraStaffPrice : extraAIVoicePrice;
  const totalPrice = type === "AIVoice" ? extraAIVoicePrice : unitPrice * quantity;

  const handleDecrease = () => {
    if (quantity > 1) setQuantity((q) => q - 1);
  };

  const handleIncrease = () => {
    setQuantity((q) => q + 1);
  };

  const handleCheckout = async () => {
    await checkoutTopup(type, quantity);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md bg-card/60 backdrop-blur-2xl border-border/50 rounded-2xl p-6 sm:p-8 shadow-2xl">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            Buy More Slots
          </DialogTitle>
          <DialogDescription className="text-muted-foreground pt-1">
            Need more capacity? Instantly add more seats to your current plan.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Type Selection */}
          <div className="flex bg-muted/30 p-1 rounded-xl">
            <button
              onClick={() => { setType("Staff"); setQuantity(1); }}
              className={`flex-1 py-2.5 px-2 text-sm font-medium rounded-lg flex items-center justify-center gap-2 transition-all ${
                type === "Staff" ? "bg-primary text-primary-foreground shadow-md" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Users className="w-4 h-4" />
              Staff
            </button>
            <button
              onClick={() => { setType("Admin"); setQuantity(1); }}
              className={`flex-1 py-2.5 px-2 text-sm font-medium rounded-lg flex items-center justify-center gap-2 transition-all ${
                type === "Admin" ? "bg-primary text-primary-foreground shadow-md" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <ShieldAlert className="w-4 h-4" />
              Admin
            </button>
            <button
              onClick={() => { setType("AIVoice"); setQuantity(1); }}
              className={`flex-1 py-2.5 px-2 text-sm font-medium rounded-lg flex items-center justify-center gap-2 transition-all ${
                type === "AIVoice" ? "bg-primary text-primary-foreground shadow-md" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              AI Voice
            </button>
          </div>

          {/* Pricing Info */}
          <div className="flex items-center justify-between p-4 bg-muted/20 border border-border/50 rounded-xl">
            <span className="text-muted-foreground font-medium">{type === "AIVoice" ? "AI Package Price" : `${type} Slot Price`}</span>
            <span className="text-xl font-bold text-foreground">${unitPrice} {type !== "AIVoice" && <span className="text-sm font-normal text-muted-foreground">/ea</span>}</span>
          </div>

          {/* Quantity Selector - Hidden for AI Voice */}
          {type !== "AIVoice" && (
            <div className="flex items-center justify-between p-4 bg-muted/20 border border-border/50 rounded-xl">
              <span className="text-muted-foreground font-medium">Quantity</span>
              <div className="flex items-center gap-4 bg-background/50 rounded-lg p-1 border border-border/50">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-md hover:bg-muted"
                  onClick={handleDecrease}
                  disabled={quantity <= 1 || loading}
                >
                  <Minus className="w-4 h-4" />
                </Button>
                <span className="w-8 text-center font-bold text-lg">{quantity}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-md hover:bg-muted"
                  onClick={handleIncrease}
                  disabled={loading}
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}

          {/* Total */}
          <div className="flex justify-between items-center py-2 px-1">
            <span className="text-foreground font-semibold text-lg">Total Due</span>
            <span className="text-2xl font-black text-foreground">${totalPrice}</span>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-4">
          <Button variant="ghost" onClick={onClose} disabled={loading} className="rounded-xl px-6">
            Cancel
          </Button>
          <Button
            onClick={handleCheckout}
            disabled={loading}
            className="rounded-xl bg-primary hover:bg-primary/90 text-white shadow-xl shadow-primary/25 px-8"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : `Pay $${totalPrice}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
