import React, { useState } from "react";
import { Navbar } from "@/components/Navbar";
import { HeroSection } from "@/components/HeroSection";
import { FeaturesSection } from "@/components/FeaturesSection";
import { StatsSection } from "@/components/StatsSection";
import { CommunicationSection } from "@/components/CommunicationSection";
import { AiVoiceSection } from "@/components/AiVoiceSection";
import { PricingSection } from "@/components/PricingSection";
import { SecuritySection } from "@/components/SecuritySection";
import { TestimonialsSection } from "@/components/TestimonialsSection";
import { CtaSection } from "@/components/CtaSection";
import { Footer } from "@/components/Footer";
import { GetStartedModal } from "@/components/GetStartedModal";
import { AuthModal } from "@/components/AuthModal";
import { CheckoutModal } from "@/components/CheckoutModal";
import { useAuth } from "@/lib/AuthContext";

export default function Home() {
  const [modalOpen, setModalOpen] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authTab, setAuthTab] = useState<"login" | "signup">("login");
  const [checkoutModalOpen, setCheckoutModalOpen] = useState(false);
  
  const { isAuthenticated } = useAuth();
  
  // Store the pending plan to checkout after successful auth
  const [checkoutPlan, setCheckoutPlan] = useState<any>(null);

  React.useEffect(() => {
    if (window.location.hash) {
      const id = window.location.hash.replace('#', '');
      const element = document.getElementById(id);
      if (element) {
        setTimeout(() => {
          element.scrollIntoView({ behavior: 'smooth' });
        }, 100);
      }
    }
  }, []);

  const handleCheckoutClick = (plan: any) => {
    if (!isAuthenticated) {
      setCheckoutPlan(plan);
      setAuthTab("login");
      setAuthModalOpen(true);
    } else {
      setCheckoutPlan(plan);
      setCheckoutModalOpen(true);
    }
  };

  const handleAuthSuccess = async () => {
    if (checkoutPlan) {
      try {
        const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
        const token = localStorage.getItem("neoapp_token");
        
        let hasSamePlan = false;
        if (token) {
          const res = await fetch(`${API_BASE}/users/company/current-plan`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          const data = await res.json();
          // If the user already has ANY active plan, don't auto-open the gateway.
          // They should be directed to the dashboard or simply see "Current Plan" in the UI.
          if (data.success && data.plan) {
            hasSamePlan = true;
          }
        }
        
        if (!hasSamePlan) {
          setCheckoutModalOpen(true);
        } else {
          setCheckoutPlan(null);
        }
      } catch (error) {
        console.error("Error checking current plan before checkout:", error);
        // Fallback to opening checkout modal if check fails
        setCheckoutModalOpen(true);
      }
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-primary/30 selection:text-primary">
      <Navbar 
        onOpenModal={() => setModalOpen(true)} 
        onOpenAuthModal={(tab) => {
          setAuthTab(tab);
          setAuthModalOpen(true);
        }}
      />
      <main>
        <HeroSection onOpenModal={() => setModalOpen(true)} />
        <StatsSection />
        <FeaturesSection />
        <CommunicationSection />
        <AiVoiceSection />
        <PricingSection onCheckout={handleCheckoutClick} />
        <SecuritySection />
        <TestimonialsSection />
        <CtaSection onOpenModal={() => setModalOpen(true)} />
      </main>
      <Footer />
      <GetStartedModal open={modalOpen} onClose={() => setModalOpen(false)} />
      <AuthModal open={authModalOpen} onClose={() => setAuthModalOpen(false)} onSuccess={handleAuthSuccess} initialTab={authTab} />
      
      <CheckoutModal 
        open={checkoutModalOpen} 
        onClose={() => {
          setCheckoutModalOpen(false);
          setCheckoutPlan(null);
        }} 
        plan={checkoutPlan}
        onSuccess={() => {
          setCheckoutModalOpen(false);
          setCheckoutPlan(null);
        }}
      />
    </div>
  );
}
