import React from "react";
import { motion } from "framer-motion";
import { Shield, Key, Smartphone, Lock } from "lucide-react";

export function SecuritySection() {
  return (
    <section className="py-24 bg-secondary/30 dark:bg-card">
      <div className="container mx-auto px-4 md:px-6">
        <div className="flex flex-col md:flex-row gap-16 items-center">
          <div className="md:w-1/3">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">Enterprise-grade security built-in.</h2>
            <p className="text-muted-foreground text-lg mb-6">
              Your business data is your most valuable asset. We treat it with the highest level of protection standard.
            </p>
          </div>
          
          <div className="md:w-2/3 grid grid-cols-1 sm:grid-cols-2 gap-6">
            {[
              {
                icon: <Shield className="w-6 h-6" />,
                title: "Multi-tenant Isolation",
                desc: "Your data is strictly isolated from other organizations at the database level."
              },
              {
                icon: <Key className="w-6 h-6" />,
                title: "JWT Authentication",
                desc: "Stateless, highly secure token-based authentication for all API requests."
              },
              {
                icon: <Lock className="w-6 h-6" />,
                title: "Role-Based Access",
                desc: "Granular permissions ensure staff only see the leads assigned to them."
              },
              {
                icon: <Smartphone className="w-6 h-6" />,
                title: "Single Device & OTP",
                desc: "Enforce strict single-device login policies and OTP verification for critical actions."
              }
            ].map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.1 }}
                className="bg-background border border-border p-6 rounded-2xl"
              >
                <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center mb-4">
                  {item.icon}
                </div>
                <h4 className="font-semibold text-lg mb-2">{item.title}</h4>
                <p className="text-muted-foreground text-sm">{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
