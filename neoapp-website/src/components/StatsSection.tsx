import React from "react";
import { motion } from "framer-motion";

const stats = [
  { value: "10,000+", label: "Businesses Scaled" },
  { value: "1M+", label: "Enquiries Managed" },
  { value: "₹500Cr+", label: "Revenue Tracked" },
  { value: "99.9%", label: "Platform Uptime" },
];

export function StatsSection() {
  return (
    <section className="py-20 border-y border-border bg-background">
      <div className="container mx-auto px-4 md:px-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-12">
          {stats.map((stat, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="text-center"
            >
              <h4 className="text-4xl md:text-5xl font-bold text-foreground mb-2 font-display">
                {stat.value}
              </h4>
              <p className="text-sm md:text-base text-muted-foreground font-medium uppercase tracking-wider">
                {stat.label}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
