import React from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ArrowRight, PlayCircle } from "lucide-react";

interface HeroSectionProps {
  onOpenModal: () => void;
}

export function HeroSection({ onOpenModal }: HeroSectionProps) {
  return (
    <section className="relative pt-32 pb-20 md:pt-40 md:pb-28 overflow-hidden">
      <div className="absolute inset-0 -z-10 bg-grid-pattern opacity-50"></div>
      <div className="absolute top-0 right-0 -z-10 w-[800px] h-[800px] bg-primary/20 dark:bg-primary/10 rounded-full blur-[100px] translate-x-1/3 -translate-y-1/3"></div>
      <div className="absolute bottom-0 left-0 -z-10 w-[600px] h-[600px] bg-indigo-500/20 dark:bg-indigo-500/10 rounded-full blur-[100px] -translate-x-1/3 translate-y-1/3"></div>

      <div className="container mx-auto px-4 md:px-6">
        <div className="flex flex-col items-center text-center space-y-8 max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium"
          >
            <span className="flex h-2 w-2 rounded-full bg-primary"></span>
            NeoApp Pro is now available
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-5xl md:text-7xl font-bold tracking-tight text-foreground"
          >
            The CRM your operations team <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-indigo-400">actually wants</span> to use.
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="text-lg md:text-xl text-muted-foreground max-w-2xl"
          >
            Stop losing leads and start closing deals. Precise, premium, and purposeful — built specifically for Indian SMBs and enterprises who demand perfection.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="flex flex-col sm:flex-row items-center gap-4 pt-4"
          >
            <Button
              size="lg"
              className="rounded-full px-8 h-14 text-base shadow-xl shadow-primary/25"
              onClick={onOpenModal}
            >
              Start Free Trial <ArrowRight className="ml-2 w-5 h-5" />
            </Button>
            <Button variant="outline" size="lg" className="rounded-full px-8 h-14 text-base glass-card hover:bg-muted/50">
              <PlayCircle className="mr-2 w-5 h-5" /> Watch Demo
            </Button>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.5 }}
          className="mt-16 md:mt-24 relative mx-auto max-w-5xl"
        >
          <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent z-10 h-full w-full bottom-0"></div>
          <img 
            src={`${import.meta.env.BASE_URL}hero-dashboard.png`}
            alt="NeoApp CRM Dashboard" 
            className="w-full h-auto rounded-xl shadow-2xl border border-border/50 object-cover bg-card/50 backdrop-blur-sm"
          />
        </motion.div>
      </div>
    </section>
  );
}
