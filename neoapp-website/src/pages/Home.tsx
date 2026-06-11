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

export default function Home() {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-primary/30 selection:text-primary">
      <Navbar onOpenModal={() => setModalOpen(true)} />
      <main>
        <HeroSection onOpenModal={() => setModalOpen(true)} />
        <StatsSection />
        <FeaturesSection />
        <CommunicationSection />
        <AiVoiceSection />
        <PricingSection onOpenModal={() => setModalOpen(true)} />
        <SecuritySection />
        <TestimonialsSection />
        <CtaSection onOpenModal={() => setModalOpen(true)} />
      </main>
      <Footer />
      <GetStartedModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}
