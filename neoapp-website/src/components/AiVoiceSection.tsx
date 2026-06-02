import React from "react";
import { motion } from "framer-motion";
import { Mic, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

export function AiVoiceSection() {
  return (
    <section id="ai-voice" className="py-24 bg-zinc-950 text-white relative overflow-hidden">
      <div className="absolute inset-0 -z-10">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-primary/20 rounded-full blur-[120px]"></div>
      </div>

      <div className="container mx-auto px-4 md:px-6">
        <div className="flex flex-col lg:flex-row-reverse items-center gap-16">
          <div className="lg:w-1/2 space-y-8">
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
            >
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/20 text-primary-400 text-sm font-medium mb-6 border border-primary/30">
                <Sparkles className="w-4 h-4" /> Pro Feature
              </div>
              <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-4 text-white">Hands-free CRM operations.</h2>
              <p className="text-lg text-zinc-400 mb-8">
                Speak to your CRM. Update lead statuses, schedule follow-ups, and log meeting notes using natural language. The AI Voice Assistant understands context and executes commands instantly.
              </p>

              <ul className="space-y-4 mb-8">
                {[
                  "Update Sharma's enquiry to Interested",
                  "Remind me to call TechCorp in 2 hours",
                  "Log a note: 'Client requested a custom quote'"
                ].map((text, i) => (
                  <li key={i} className="flex items-center gap-3 text-zinc-300">
                    <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center shrink-0">
                      <Mic className="w-4 h-4" />
                    </div>
                    <span className="italic">"{text}"</span>
                  </li>
                ))}
              </ul>

              <Button size="lg" className="rounded-full px-8 bg-white text-black hover:bg-zinc-200">
                Explore Pro Plan
              </Button>
            </motion.div>
          </div>

          <div className="lg:w-1/2 w-full">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8 }}
              className="relative"
            >
              <img 
                src="/ai-voice.png" 
                alt="AI Voice Assistant Visualization" 
                className="w-full h-auto max-w-lg mx-auto rounded-3xl"
              />
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}
