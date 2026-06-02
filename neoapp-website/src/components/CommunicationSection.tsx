import React from "react";
import { motion } from "framer-motion";
import { SiWhatsapp, SiGmail } from "react-icons/si";
import { MessageCircle, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CommunicationSection() {
  return (
    <section id="communication" className="py-24 overflow-hidden relative">
      <div className="container mx-auto px-4 md:px-6">
        <div className="flex flex-col lg:flex-row items-center gap-16">
          <div className="lg:w-1/2 space-y-8">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
            >
              <h2 className="text-sm font-semibold text-primary uppercase tracking-wider mb-2">Omnichannel Hub</h2>
              <h3 className="text-3xl md:text-5xl font-bold tracking-tight mb-4">Communicate where your clients are.</h3>
              <p className="text-lg text-muted-foreground mb-8">
                Seamlessly integrated messaging channels. Send bulk updates, automated transactional alerts, and personalized emails without switching tabs.
              </p>

              <div className="space-y-6">
                <div className="flex gap-4 items-start">
                  <div className="w-10 h-10 rounded-lg bg-[#25D366]/10 text-[#25D366] flex items-center justify-center shrink-0">
                    <SiWhatsapp className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-lg">WhatsApp Business APIs</h4>
                    <p className="text-muted-foreground">Integrate WATI, Meta, or Twilio for official WhatsApp communication directly from the lead view.</p>
                  </div>
                </div>

                <div className="flex gap-4 items-start">
                  <div className="w-10 h-10 rounded-lg bg-[#EA4335]/10 text-[#EA4335] flex items-center justify-center shrink-0">
                    <SiGmail className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-lg">Email Campaigns via SMTP</h4>
                    <p className="text-muted-foreground">Send professional estimates, welcome emails, and follow-ups securely.</p>
                  </div>
                </div>

                <div className="flex gap-4 items-start">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <MessageCircle className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-lg">Bulk Messaging & Alerts</h4>
                    <p className="text-muted-foreground">Broadcast updates to segmented lists with one click.</p>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>

          <div className="lg:w-1/2 w-full">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="relative rounded-2xl glass-card border border-border/50 p-6 md:p-8 bg-gradient-to-br from-card to-background shadow-2xl"
            >
              {/* Mock Chat UI */}
              <div className="space-y-4">
                <div className="flex justify-between items-center border-b border-border pb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                      <span className="font-bold text-primary">AK</span>
                    </div>
                    <div>
                      <h5 className="font-semibold text-sm">Arjun Kumar</h5>
                      <span className="text-xs text-[#25D366] flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[#25D366]"></span> WhatsApp Online</span>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" className="h-8">View Profile</Button>
                </div>

                <div className="space-y-4 pt-2">
                  <div className="flex flex-col gap-1 max-w-[80%]">
                    <div className="bg-secondary p-3 rounded-2xl rounded-tl-sm text-sm">
                      Hi, I'm interested in the Pro plan. Can we schedule a demo?
                    </div>
                    <span className="text-xs text-muted-foreground ml-1">10:42 AM</span>
                  </div>
                  
                  <div className="flex flex-col gap-1 max-w-[80%] self-end ml-auto items-end">
                    <div className="bg-primary text-primary-foreground p-3 rounded-2xl rounded-tr-sm text-sm">
                      Absolutely Arjun! I've attached our availability link.
                    </div>
                    <span className="text-xs text-muted-foreground mr-1">10:45 AM</span>
                  </div>
                </div>

                <div className="mt-6 flex gap-2 pt-4 border-t border-border relative">
                  <div className="h-10 flex-1 bg-secondary rounded-full flex items-center px-4 text-sm text-muted-foreground">
                    Type a message...
                  </div>
                  <Button size="icon" className="rounded-full h-10 w-10 shrink-0">
                    <Zap className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}
