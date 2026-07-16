import React from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";

interface CtaSectionProps {
  onOpenModal: () => void;
}

export function CtaSection({ onOpenModal }: CtaSectionProps) {
  return (
    <section className="py-24 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-900 via-blue-800 to-blue-600 dark:from-indigo-950 dark:via-blue-900 dark:to-slate-900"></div>
      <div className="absolute inset-0 bg-grid-pattern opacity-10"></div>
      
      <div className="container mx-auto px-4 md:px-6 relative z-10">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="max-w-4xl mx-auto text-center text-white bg-black/30 dark:bg-black/40 backdrop-blur-xl p-12 md:p-20 rounded-3xl border border-white/20 dark:border-white/10 shadow-2xl"
        >
          <h2 className="text-4xl md:text-6xl font-bold tracking-tight mb-6 font-display">
            Ready to upgrade your operations?
          </h2>
          <p className="text-lg md:text-xl opacity-90 mb-10 max-w-2xl mx-auto">
            Join thousands of businesses who have switched to the CRM that actually makes work feel less like work.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <Button
              size="lg"
              variant="secondary"
              className="rounded-full h-14 px-8 text-base shadow-lg"
              onClick={onOpenModal}
            >
              Start your 14-day free trial
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="rounded-full h-14 px-8 text-base bg-transparent border-white/30 text-white hover:bg-white/10 hover:text-white dark:border-border dark:text-foreground dark:hover:bg-accent"
              onClick={onOpenModal}
            >
              Contact Sales
            </Button>
          </div>
          <p className="mt-6 text-sm opacity-70">No credit card required for Free CRM.</p>
        </motion.div>
      </div>
    </section>
  );
}
