import React from "react";
import { motion } from "framer-motion";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PricingSectionProps {
  onOpenModal: () => void;
}

const plans = [
  {
    name: "Free CRM",
    price: "0",
    description: "Perfect for solopreneurs getting started.",
    trial: "3-day trial",
    limits: "1 Admin • 1 Staff",
    features: [
      "Enquiry Management",
      "Smart Follow-ups",
      "Basic Reports",
      "Monthly Targets",
    ],
    missing: [
      "Team Chat",
      "WhatsApp & Email API",
      "AI Voice Assistant",
      "Bulk Messaging"
    ],
    highlight: false,
    button: "Start Free"
  },
  {
    name: "Basic CRM",
    price: "7999",
    description: "For small teams building operations.",
    trial: "1 Year",
    limits: "1 Admin • 2 Staff",
    extra: "Extra admin ₹1150/mo, staff ₹800/mo",
    features: [
      "Everything in Free",
      "Team Chat (Real-time)",
      "Advanced Reports",
      "Enhanced Security",
    ],
    missing: [
      "WhatsApp & Email API",
      "AI Voice Assistant",
      "Bulk Messaging"
    ],
    highlight: false,
    button: "Start Basic"
  },
  {
    name: "Pro CRM",
    price: "13000",
    description: "The complete enterprise powerhouse.",
    trial: "1 Year",
    limits: "2 Admins • 10 Staff",
    extra: "Extra admin ₹1150/mo, staff ₹800/mo",
    features: [
      "Everything in Basic",
      "WhatsApp Business API",
      "Email (SMTP) Integration",
      "AI Voice Assistant",
      "Bulk Messaging Campaigns"
    ],
    missing: [],
    highlight: true,
    button: "Get Pro"
  }
];

export function PricingSection({ onOpenModal }: PricingSectionProps) {
  return (
    <section id="pricing" className="py-24 bg-background">
      <div className="container mx-auto px-4 md:px-6">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-sm font-semibold text-primary uppercase tracking-wider mb-2">Pricing</h2>
          <h3 className="text-3xl md:text-5xl font-bold tracking-tight mb-4">Transparent plans for growing teams.</h3>
          <p className="text-lg text-muted-foreground">
            No hidden fees. Scale your CRM as your operations grow.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {plans.map((plan, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className={`rounded-3xl p-8 flex flex-col ${plan.highlight
                  ? "bg-primary text-primary-foreground shadow-2xl shadow-primary/20 scale-105 z-10 relative"
                  : "glass-card"
                }`}
            >
              <div className="mb-8">
                <h4 className={`text-xl font-semibold mb-2 ${plan.highlight ? "text-primary-foreground" : ""}`}>{plan.name}</h4>
                <p className={`text-sm mb-6 h-10 ${plan.highlight ? "text-primary-foreground/80" : "text-muted-foreground"}`}>{plan.description}</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold">₹</span>
                  <span className="text-5xl font-bold tracking-tight font-display">{plan.price}</span>
                  <span className={`text-sm ${plan.highlight ? "text-primary-foreground/80" : "text-muted-foreground"}`}>/month</span>
                </div>
                <div className="mt-2 text-sm font-medium">
                  {plan.trial}
                </div>
              </div>

              <div className={`py-4 border-y border-dashed mb-6 ${plan.highlight ? "border-primary-foreground/20" : "border-border"}`}>
                <div className="font-semibold text-sm mb-1">{plan.limits}</div>
                {plan.extra && <div className={`text-xs ${plan.highlight ? "text-primary-foreground/70" : "text-muted-foreground"}`}>{plan.extra}</div>}
              </div>

              <ul className="space-y-4 mb-8 flex-1">
                {plan.features.map((feature, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm">
                    <Check className={`w-5 h-5 shrink-0 ${plan.highlight ? "text-primary-foreground" : "text-primary"}`} />
                    <span>{feature}</span>
                  </li>
                ))}
                {plan.missing.map((feature, i) => (
                  <li key={i} className={`flex items-start gap-3 text-sm ${plan.highlight ? "text-primary-foreground/50" : "text-muted-foreground"}`}>
                    <X className="w-5 h-5 shrink-0 opacity-50" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <Button
                variant={plan.highlight ? "secondary" : "default"}
                className={`w-full rounded-full h-12 text-base font-semibold ${plan.highlight ? "text-primary hover:bg-white" : ""
                  }`}
                onClick={onOpenModal}
              >
                {plan.button}
              </Button>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
