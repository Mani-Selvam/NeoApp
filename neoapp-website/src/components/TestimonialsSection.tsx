import React from "react";
import { motion } from "framer-motion";
import { Star } from "lucide-react";

const testimonials = [
  {
    quote: "NeoApp transformed how our sales team operates. We were losing track of follow-ups on spreadsheets. Now, the 5-minute reminders have boosted our conversion rate by 40%.",
    author: "Priya Sharma",
    role: "Director of Sales, TechCorp India"
  },
  {
    quote: "The multi-channel communication is a game-changer. Being able to send a WhatsApp quote directly from the lead view saves my team hours every single day.",
    author: "Rahul Verma",
    role: "Founder, Verma & Sons"
  },
  {
    quote: "We evaluated Salesforce and Zoho, but they felt bloated. NeoApp is exactly what an Indian SMB needs—fast, beautiful, and absolutely zero learning curve.",
    author: "Neha Gupta",
    role: "Operations Head, Nexus Logistics"
  }
];

export function TestimonialsSection() {
  return (
    <section className="py-24 bg-background">
      <div className="container mx-auto px-4 md:px-6">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-4">Trusted by the best.</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {testimonials.map((t, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="glass-card rounded-3xl p-8 relative"
            >
              <div className="flex gap-1 text-yellow-400 mb-6">
                {[...Array(5)].map((_, j) => <Star key={j} className="w-5 h-5 fill-current" />)}
              </div>
              <p className="text-lg mb-8 leading-relaxed">"{t.quote}"</p>
              <div>
                <div className="font-semibold">{t.author}</div>
                <div className="text-sm text-muted-foreground">{t.role}</div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
