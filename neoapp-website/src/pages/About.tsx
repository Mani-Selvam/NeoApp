import React, { useState, useEffect } from "react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { AuthModal } from "@/components/AuthModal";
import { motion } from "framer-motion";
import { Target, Lightbulb, Rocket, ShieldCheck, Globe, Users, TrendingUp, Sparkles } from "lucide-react";

export default function About() {
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authTab, setAuthTab] = useState<"login" | "signup">("login");

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const coreValues = [
    {
      title: "Growth-Oriented Mindset",
      description: "We actively monitor, measure, and maintain both company and customer growth, ensuring mutual success and long-term sustainability through ongoing improvement and support.",
      icon: <TrendingUp className="w-6 h-6 text-indigo-500" />
    },
    {
      title: "Continuous Advancement",
      description: "We are committed to continuous updating and implementing the latest technologies, ensuring our products and services remain relevant and impactful in a fast-paced digital landscape.",
      icon: <Rocket className="w-6 h-6 text-teal-500" />
    },
    {
      title: "Persistence in Innovation",
      description: "We never give up on product development and deliveries, constantly pushing boundaries to create cutting-edge solutions that meet the evolving needs of our customers.",
      icon: <Lightbulb className="w-6 h-6 text-amber-500" />
    },
    {
      title: "Commitment to Excellence",
      description: "We are dedicated to delivering high-quality products and services, ensuring every solution meets the highest standards of performance and reliability.",
      icon: <ShieldCheck className="w-6 h-6 text-rose-500" />
    }
  ];

  const markets = [
    "India", "Ireland", "Singapore", "Australia", 
    "United States", "Poland", "Sweden", "UK", 
    "Malaysia", "UAE"
  ];

  return (
    <div className="min-h-screen bg-[#f5f5f7] dark:bg-[#000000] text-foreground selection:bg-primary/30 selection:text-primary flex flex-col font-sans">
      <Navbar 
        onOpenModal={() => {}} 
        onOpenAuthModal={(tab) => {
          setAuthTab(tab);
          setAuthModalOpen(true);
        }}
      />
      
      <main className="flex-grow pt-32 pb-20">
        {/* Hero Section */}
        <section className="px-4 md:px-8 max-w-5xl mx-auto text-center space-y-6 mb-20 mt-10">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-semibold uppercase tracking-wider mb-4"
          >
            <Sparkles className="w-4 h-4" /> About Neophron Technologies
          </motion.div>
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-4xl md:text-6xl font-semibold tracking-tight text-foreground leading-tight"
          >
            Empowering the <span className="text-primary">AI-driven</span> digital age.
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto font-light leading-relaxed"
          >
            We are a full-stack AI-driven Web and Mobile Application Development Company, providing intelligent, scalable, and innovative digital solutions to customers worldwide.
          </motion.p>
        </section>

        <div className="max-w-6xl mx-auto px-4 md:px-8 space-y-16">
          
          {/* Company Overview Details */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="glass-card bg-white/70 dark:bg-zinc-900/70 backdrop-blur-xl border border-white/20 dark:border-white/10 rounded-3xl p-8 md:p-12 shadow-sm text-lg text-muted-foreground space-y-6 leading-relaxed"
          >
            <p>
              Our expertise includes AI-driven Enterprise Resource Planning (ERP) Systems, Web Development, E-Commerce Solutions, Mobile Application Development, Business Managed Services, and Custom Software Development. Our intelligent solutions enable organizations to automate processes, improve efficiency, and make data-driven business decisions.
            </p>
            <p>
              Our technical capabilities include Machine Learning (ML), Agentic AI, and AI-powered Data Analytics, which help businesses attain predictive insights, simplify processes, and attain intelligent process automation. Using Natural Language Processing (NLP), Predictive Analytics, and Intelligent Automation, we redesign conventional systems as adaptive, autonomous, and future-proof digital ecosystems.
            </p>
            <p className="font-medium text-foreground">
              At Neophron, we promise to provide reliable, scalable, and innovation-enabled IT services that enable businesses to confidently lead the AI-driven digital age.
            </p>
          </motion.div>

          {/* Vision & Mission */}
          <div className="grid md:grid-cols-2 gap-8">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="glass-card bg-gradient-to-br from-indigo-500/10 to-purple-500/10 dark:from-indigo-500/20 dark:to-purple-500/20 backdrop-blur-xl border border-white/20 dark:border-white/10 rounded-3xl p-8 md:p-10 shadow-sm"
            >
              <div className="w-12 h-12 bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 rounded-2xl flex items-center justify-center mb-6">
                <Target className="w-6 h-6" />
              </div>
              <h3 className="text-3xl font-semibold tracking-tight mb-6">Our Vision</h3>
              <ul className="space-y-4 text-muted-foreground">
                <li className="flex gap-3">
                  <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0"></div>
                  <span>Expand marketing efforts to promote products and solutions, increasing visibility and customer engagement.</span>
                </li>
                <li className="flex gap-3">
                  <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0"></div>
                  <span>Provide digital solutions that help businesses optimize team management, improving efficiency and performance.</span>
                </li>
                <li className="flex gap-3">
                  <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0"></div>
                  <span>Achieve ₹100 crore in revenue by 2030, establishing Neophron Technologies as a leading technology provider.</span>
                </li>
                <li className="flex gap-3">
                  <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0"></div>
                  <span>Position Neophron Technologies among the top in the industry, showcasing leadership and innovation.</span>
                </li>
                <li className="flex gap-3">
                  <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0"></div>
                  <span>Continue supporting businesses with digital solutions that improve operations, enhance sustainability, and promote long-term growth.</span>
                </li>
              </ul>
            </motion.div>

            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="glass-card bg-gradient-to-br from-teal-500/10 to-emerald-500/10 dark:from-teal-500/20 dark:to-emerald-500/20 backdrop-blur-xl border border-white/20 dark:border-white/10 rounded-3xl p-8 md:p-10 shadow-sm"
            >
              <div className="w-12 h-12 bg-teal-500/20 text-teal-600 dark:text-teal-400 rounded-2xl flex items-center justify-center mb-6">
                <Rocket className="w-6 h-6" />
              </div>
              <h3 className="text-3xl font-semibold tracking-tight mb-6">Our Mission</h3>
              <ul className="space-y-4 text-muted-foreground">
                <li className="flex gap-3">
                  <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-teal-500 shrink-0"></div>
                  <span>Deliver exceptional services by consistently upholding our product commitments, ensuring quality and reliability.</span>
                </li>
                <li className="flex gap-3">
                  <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-teal-500 shrink-0"></div>
                  <span>Drive the growth and development of business owners by providing tailored solutions that empower them to succeed in a digital-first world.</span>
                </li>
                <li className="flex gap-3">
                  <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-teal-500 shrink-0"></div>
                  <span>Foster strong customer relationships by keeping them informed with regular tech updates and continuous support.</span>
                </li>
              </ul>
              <div className="mt-8 p-4 bg-white/40 dark:bg-black/20 rounded-2xl text-sm font-medium text-foreground">
                This mission will guide Neophron Technologies in its quest to build lasting relationships with clients and continue its growth trajectory.
              </div>
            </motion.div>
          </div>

          {/* Core Values */}
          <section className="space-y-8">
            <div className="text-center">
              <h2 className="text-3xl md:text-4xl font-semibold tracking-tight">Core Values</h2>
              <p className="text-muted-foreground mt-2">The principles that drive our dedication and success.</p>
            </div>
            
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              {coreValues.map((value, idx) => (
                <motion.div 
                  key={idx}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: idx * 0.1 }}
                  className="glass-card bg-white/70 dark:bg-zinc-900/70 backdrop-blur-xl border border-white/20 dark:border-white/10 rounded-3xl p-6 shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className="mb-4 p-3 bg-black/5 dark:bg-white/5 rounded-2xl inline-block">
                    {value.icon}
                  </div>
                  <h4 className="text-lg font-semibold mb-3">{value.title}</h4>
                  <p className="text-sm text-muted-foreground leading-relaxed">{value.description}</p>
                </motion.div>
              ))}
            </div>
          </section>

          {/* Markets Served */}
          <section className="py-12 border-y border-border/50">
            <div className="flex flex-col md:flex-row gap-8 items-center justify-between">
              <div className="md:w-1/3">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-primary/10 text-primary mb-4">
                  <Globe className="w-6 h-6" />
                </div>
                <h2 className="text-3xl font-semibold tracking-tight mb-2">Markets Served</h2>
                <p className="text-muted-foreground">Delivering digital excellence across the globe.</p>
              </div>
              <div className="md:w-2/3 flex flex-wrap gap-3">
                {markets.map((market, idx) => (
                  <span key={idx} className="px-4 py-2 rounded-full bg-white dark:bg-zinc-800 border border-border shadow-sm text-sm font-medium">
                    {market}
                  </span>
                ))}
              </div>
            </div>
          </section>

          {/* Meet Our Founders */}
          <section className="space-y-10 pb-10">
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-primary/10 text-primary mb-4">
                <Users className="w-6 h-6" />
              </div>
              <h2 className="text-3xl md:text-4xl font-semibold tracking-tight">Meet Our Founders</h2>
            </div>
            
            <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
              {/* Founder 1 */}
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                className="glass-card bg-white/70 dark:bg-zinc-900/70 backdrop-blur-xl border border-white/20 dark:border-white/10 rounded-3xl p-8 flex flex-col items-center text-center shadow-sm group cursor-pointer"
              >
                <div className="w-32 h-32 rounded-full overflow-hidden bg-gradient-to-br from-indigo-400 to-purple-500 mb-6 border-4 border-background shadow-lg flex items-center justify-center text-white text-3xl font-bold relative">
                  <div className="scan-line"></div>
                  <img src={`${import.meta.env.BASE_URL}founder-coo.png`} alt="Hari Sakthi M" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                </div>
                <h3 className="text-2xl font-semibold">Hari Sakthi M</h3>
                <p className="text-primary font-medium mt-1 mb-4">Founder - COO</p>
                <p className="text-sm text-muted-foreground">
                  "Operational excellence is the bridge between our vision and our clients' success."
                </p>
              </motion.div>

              {/* Founder 2 */}
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: 0.1 }}
                className="glass-card bg-white/70 dark:bg-zinc-900/70 backdrop-blur-xl border border-white/20 dark:border-white/10 rounded-3xl p-8 flex flex-col items-center text-center shadow-sm group cursor-pointer"
              >
                <div className="w-32 h-32 rounded-full overflow-hidden bg-gradient-to-br from-teal-400 to-emerald-500 mb-6 border-4 border-background shadow-lg flex items-center justify-center text-white text-3xl font-bold relative">
                  <div className="scan-line"></div>
                  <img src={`${import.meta.env.BASE_URL}founder-cto.png`} alt="Elangathir S" className="w-full h-full object-cover object-top group-hover:scale-110 transition-transform duration-500" />
                </div>
                <h3 className="text-2xl font-semibold">Elangathir S</h3>
                <p className="text-primary font-medium mt-1 mb-4">Founder - CTO</p>
                <p className="text-sm text-muted-foreground">
                  "Building intelligent, scalable systems today to power the digital ecosystems of tomorrow."
                </p>
              </motion.div>
            </div>
          </section>

        </div>
      </main>

      <Footer />
      <AuthModal open={authModalOpen} onClose={() => setAuthModalOpen(false)} initialTab={authTab} />
    </div>
  );
}
