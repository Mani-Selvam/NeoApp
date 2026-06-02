import React from "react";
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

export default function Home() {
  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-primary/30 selection:text-primary">
      <Navbar />
      <main>
        <HeroSection />
        <StatsSection />
        <FeaturesSection />
        <CommunicationSection />
        <AiVoiceSection />
        <PricingSection />
        <SecuritySection />
        <TestimonialsSection />
        <CtaSection />
      </main>
      <Footer />
    </div>
  );
}
