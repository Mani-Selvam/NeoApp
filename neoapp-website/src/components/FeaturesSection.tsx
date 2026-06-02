import React from "react";
import { motion } from "framer-motion";
import { 
  Users, Target, MessageSquare, 
  BarChart, Clock, ShieldCheck, 
  Activity, Layers
} from "lucide-react";

const features = [
  {
    icon: <Layers className="w-6 h-6" />,
    title: "Pipeline Management",
    description: "Track leads through 8 distinct stages: New, Contacted, Interested, In Progress, Converted, Closed, Not Interested, Dropped."
  },
  {
    icon: <Clock className="w-6 h-6" />,
    title: "Smart Follow-ups",
    description: "Never miss a beat with intelligent countdown reminders triggering at 60m, 5m, and 1m before scheduled contact."
  },
  {
    icon: <MessageSquare className="w-6 h-6" />,
    title: "Team Chat",
    description: "Built-in real-time WebSocket chat keeps your entire operations team aligned without leaving the CRM."
  },
  {
    icon: <BarChart className="w-6 h-6" />,
    title: "Reports & Analytics",
    description: "Granular insights into enquiry conversion, follow-up completion rates, revenue tracking, and staff KPIs."
  },
  {
    icon: <Target className="w-6 h-6" />,
    title: "Business Targets",
    description: "Set and visualize monthly revenue and conversion goals with beautiful progress tracking."
  },
  {
    icon: <Users className="w-6 h-6" />,
    title: "Staff Management",
    description: "Granular role-based access control (Admin/Staff) ensures your data is only seen by the right people."
  }
];

export function FeaturesSection() {
  return (
    <section id="features" className="py-24 bg-secondary/50 dark:bg-card">
      <div className="container mx-auto px-4 md:px-6">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-sm font-semibold text-primary uppercase tracking-wider mb-2">Core Capabilities</h2>
          <h3 className="text-3xl md:text-5xl font-bold tracking-tight mb-4">Everything you need. Nothing you don't.</h3>
          <p className="text-lg text-muted-foreground">
            A meticulously crafted feature set designed to optimize the workflow of Indian enterprises.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="glass-card rounded-2xl p-8 hover:shadow-xl transition-all duration-300 group"
            >
              <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                {feature.icon}
              </div>
              <h4 className="text-xl font-semibold mb-3">{feature.title}</h4>
              <p className="text-muted-foreground leading-relaxed">
                {feature.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
