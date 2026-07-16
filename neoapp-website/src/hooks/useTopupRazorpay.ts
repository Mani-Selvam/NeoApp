import { useState, useCallback } from "react";
import { useAuth } from "@/lib/AuthContext";
import { useToast } from "@/hooks/use-toast";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

const loadRazorpayScript = () => {
  return new Promise((resolve) => {
    if (document.getElementById("razorpay-sdk")) {
      resolve(true);
      return;
    }
    const script = document.createElement("script");
    script.id = "razorpay-sdk";
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => {
      console.error("Razorpay SDK failed to load.");
      resolve(false);
    };
    document.body.appendChild(script);
  });
};

export const useTopupRazorpay = () => {
  const [loading, setLoading] = useState(false);
  const { token, user } = useAuth();
  const { toast } = useToast();

  const checkoutTopup = useCallback(async (type: "Admin" | "Staff" | "AIVoice", quantity: number) => {
    const currentToken = localStorage.getItem("neoapp_token") || token;
    
    if (!currentToken) {
      toast({ title: "Authentication required", variant: "destructive" });
      return false;
    }

    setLoading(true);

    try {
      const isAI = type === "AIVoice";
      const orderUrl = isAI ? `${API_BASE}/ai-payments/razorpay/order` : `${API_BASE}/admin-staff-payment/razorpay/order`;
      const verifyUrl = isAI ? `${API_BASE}/ai-payments/razorpay/verify` : `${API_BASE}/admin-staff-payment/razorpay/verify`;

      // 1. Create order
      const res = await fetch(orderUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${currentToken}`,
        },
        body: JSON.stringify(isAI ? {} : { type, quantity }),
      });

      const orderData = await res.json();
      if (!res.ok) throw new Error(orderData.message || "Failed to create order");

      // 2. Load script
      const isLoaded = await loadRazorpayScript();
      if (!isLoaded) {
        throw new Error("Razorpay SDK failed to load. Are you online?");
      }

      // 3. Open Razorpay Checkout
      const options = {
        key: orderData.keyId,
        amount: orderData.amountInrPaise,
        currency: orderData.currency,
        name: "NeoApp CRM",
        description: isAI ? "AI Voice Top-up" : `${type} Slots Upgrade x${quantity}`,
        order_id: orderData.razorpayOrderId,
        handler: async function (response: any) {
          try {
            // Verify
            const verifyPayload = isAI 
              ? { 
                  razorpay_order_id: response.razorpay_order_id,
                  razorpay_payment_id: response.razorpay_payment_id,
                  razorpay_signature: response.razorpay_signature
                }
              : {
                  type,
                  quantity,
                  razorpay_order_id: response.razorpay_order_id,
                  razorpay_payment_id: response.razorpay_payment_id,
                  razorpay_signature: response.razorpay_signature
                };

            const verifyRes = await fetch(verifyUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${currentToken}`
              },
              body: JSON.stringify(verifyPayload)
            });
            const verifyData = await verifyRes.json();
            
            if (verifyData.success) {
              toast({
                title: "Top-up Successful! 🎉",
                description: isAI ? "Successfully purchased AI Voice Top-up." : `Successfully added ${quantity} ${type} slot(s).`,
              });
              setTimeout(() => {
                window.location.reload();
              }, 2000);
            } else {
              toast({
                title: "Verification Failed",
                description: verifyData.message || "Payment verification failed",
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
          contact: "",
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
      return true;

    } catch (error: any) {
      console.error("Razorpay Error:", error);
      toast({
        title: "Payment Error",
        description: error.message || "Failed to initiate payment",
        variant: "destructive",
      });
      return false;
    } finally {
      setLoading(false);
    }
  }, [token, toast, user]);

  return { checkoutTopup, loading };
};
