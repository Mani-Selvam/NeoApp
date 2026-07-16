import { useState, useCallback } from "react";
import { useAuth } from "@/lib/AuthContext";
import { useToast } from "@/hooks/use-toast";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000";

const loadRazorpayScript = () => {
  return new Promise((resolve) => {
    if ((window as any).Razorpay) {
      resolve(true);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => {
      resolve(true);
    };
    script.onerror = () => {
      resolve(false);
    };
    document.body.appendChild(script);
  });
};

export const useRazorpay = () => {
  const [loading, setLoading] = useState(false);
  const { token, user } = useAuth();
  const { toast } = useToast();

  const checkout = useCallback(async (planId: string, maxAdmins: number, maxStaff: number, couponCode: string = "") => {
    // Get the latest token directly from localStorage to prevent stale closures if called immediately after login
    const currentToken = localStorage.getItem("neoapp_token") || token;
    
    if (!currentToken) {
      toast({ title: "Authentication required", variant: "destructive" });
      return false;
    }

    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/users/billing/razorpay/order`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${currentToken}`,
        },
        body: JSON.stringify({
          planId,
          adminCount: maxAdmins,
          staffCount: maxStaff,
          couponCode,
        }),
      });

      const orderData = await res.json();
      if (!res.ok) throw new Error(orderData.message || "Failed to create order");

      if (!orderData.requiresPayment) {
         // Free plan activation case (already activated by backend without payment)
         toast({ title: "Plan activated successfully!" });
         setLoading(false);
         return true;
      }

      // 2. Load script
      const resScript = await loadRazorpayScript();
      if (!resScript) {
        throw new Error("Razorpay SDK failed to load. Are you online?");
      }

      // 3. Open Razorpay Checkout
      const options = {
        key: orderData.keyId,
        amount: orderData.amountInrPaise,
        currency: orderData.currency,
        name: "NeoApp CRM",
        description: "Plan Subscription Upgrade",
        order_id: orderData.orderId,
        handler: async function (response: any) {
          try {
            // Call backend verification
            const verifyRes = await fetch(`${API_BASE}/users/billing/razorpay/verify`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
              },
              body: JSON.stringify({
                planId,
                couponCode,
                adminCount: maxAdmins,
                staffCount: maxStaff,
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature
              })
            });
            const verifyData = await verifyRes.json();
            
            if (verifyData.success) {
              toast({
                title: "Payment Successful! 🎉",
                description: "Your plan has been activated.",
              });
              setTimeout(() => {
                window.location.reload();
              }, 2000);
            } else {
              toast({
                title: "Verification Failed",
                description: verifyData.message || "Payment verification failed on server",
                variant: "destructive",
              });
            }
          } catch (err) {
            console.error("Verification error", err);
            toast({
              title: "Verification Error",
              description: "An error occurred while verifying the payment.",
              variant: "destructive",
            });
          }
        },
        prefill: {
          name: user?.name,
          email: user?.email,
          contact: "", // we don't store mobile in context yet, but Razorpay will ask if missing
        },
        theme: {
          color: "#4f46e5",
        },
      };

      const rzp1 = new (window as any).Razorpay(options);
      
      rzp1.on("payment.failed", function (response: any) {
        toast({
          title: "Payment Failed",
          description: response.error.description,
          variant: "destructive",
        });
      });

      rzp1.open();
      setLoading(false);
      return true;

    } catch (err: any) {
      setLoading(false);
      toast({
        title: "Checkout Error",
        description: err.message,
        variant: "destructive",
      });
      return false;
    }
  }, [token, user, toast]);

  return { checkout, loading };
};
