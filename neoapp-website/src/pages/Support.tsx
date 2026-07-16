import React, { useState, useEffect } from "react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { AuthModal } from "@/components/AuthModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { MessageCircle, Mail, Phone, FileText, ChevronRight, CheckCircle2 } from "lucide-react";

export default function Support() {
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authTab, setAuthTab] = useState<"login" | "signup">("login");
  const { toast } = useToast();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);
  
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    mobile: "",
    topic: "",
    message: ""
  });
  
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    
    try {
      const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:7000/api";
      // VITE_API_URL already ends with /api — use it directly
      const apiUrl = API_BASE.endsWith("/api") ? API_BASE : `${API_BASE}/api`;
      
      const response = await fetch(`${apiUrl}/support/tickets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          name: formData.name,
          email: formData.email,
          mobile: formData.mobile,
          message: `[Topic: ${formData.topic}]\n${formData.message}`,
          source: "website"
        })
      });

      const data = await response.json();
      
      if (!response.ok || !data.success) {
        throw new Error(data.message || "Failed to submit request");
      }

      setFormData({ name: "", email: "", mobile: "", topic: "", message: "" });
      toast({
        title: "Message Sent ✓",
        description: "We've received your support request and will be in touch shortly.",
      });
    } catch (err: any) {
      const msg = err?.name === "AbortError"
        ? "Request timed out. Please check your connection and try again."
        : (err.message || "Something went wrong. Please try again.");
      toast({
        title: "Error",
        description: msg,
        variant: "destructive"
      });
    } finally {
      clearTimeout(timeoutId);
      setIsSubmitting(false);
    }
  };

  const faqTopics = [
    { title: "Billing & Plans", icon: <FileText className="w-5 h-5 text-primary" />, desc: "Manage your subscription, invoices, and payment methods." },
    { title: "Technical Support", icon: <MessageCircle className="w-5 h-5 text-primary" />, desc: "Troubleshoot issues, report bugs, and get help with features." },
    { title: "Account Settings", icon: <CheckCircle2 className="w-5 h-5 text-primary" />, desc: "Update your profile, change passwords, and manage team members." }
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
      
      <main className="flex-grow pt-36 pb-20 px-4 md:px-8">
        <div className="max-w-5xl mx-auto space-y-16">
          
          {/* Header Section */}
          <div className="text-center space-y-4">
            <h1 className="text-4xl md:text-6xl font-semibold tracking-tight text-foreground">
              How can we help?
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto font-light">
              We're here to assist you with any questions or issues you might have.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 lg:gap-12">
            
            {/* Form Section */}
            <div className="lg:col-span-2">
              <div className="glass-card bg-white/70 dark:bg-zinc-900/70 backdrop-blur-xl border border-white/20 dark:border-white/10 rounded-3xl p-8 md:p-10 shadow-sm">
                <h2 className="text-2xl font-semibold mb-6">Contact Us</h2>
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground ml-1">Full Name</label>
                      <Input 
                        required
                        placeholder="John Doe" 
                        className="bg-black/5 dark:bg-white/5 border-transparent focus:border-primary/50 focus:ring-primary/50 rounded-xl h-12 transition-all duration-200"
                        value={formData.name}
                        onChange={(e) => setFormData({...formData, name: e.target.value})}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground ml-1">Email Address</label>
                      <Input 
                        required
                        type="email"
                        placeholder="john@example.com" 
                        className="bg-black/5 dark:bg-white/5 border-transparent focus:border-primary/50 focus:ring-primary/50 rounded-xl h-12 transition-all duration-200"
                        value={formData.email}
                        onChange={(e) => setFormData({...formData, email: e.target.value})}
                      />
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground ml-1">Phone Number</label>
                      <Input 
                        type="tel"
                        placeholder="+1 234 567 8900" 
                        className="bg-black/5 dark:bg-white/5 border-transparent focus:border-primary/50 focus:ring-primary/50 rounded-xl h-12 transition-all duration-200"
                        value={formData.mobile}
                        onChange={(e) => setFormData({...formData, mobile: e.target.value})}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground ml-1">Topic</label>
                      <select 
                        required
                        className="flex h-12 w-full items-center justify-between rounded-xl border-transparent bg-black/5 dark:bg-white/5 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:cursor-not-allowed disabled:opacity-50 transition-all duration-200"
                        value={formData.topic}
                        onChange={(e) => setFormData({...formData, topic: e.target.value})}
                      >
                        <option value="" disabled className="dark:bg-zinc-900">Select a topic...</option>
                        <option value="billing" className="dark:bg-zinc-900">Billing & Subscription</option>
                        <option value="technical" className="dark:bg-zinc-900">Technical Issue</option>
                        <option value="other" className="dark:bg-zinc-900">Other</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground ml-1">Message</label>
                    <Textarea 
                      required
                      placeholder="How can we help you today?" 
                      className="bg-black/5 dark:bg-white/5 border-transparent focus:border-primary/50 focus:ring-primary/50 rounded-xl min-h-[150px] resize-none transition-all duration-200"
                      value={formData.message}
                      onChange={(e) => setFormData({...formData, message: e.target.value})}
                    />
                  </div>

                  <Button 
                    type="submit" 
                    className="w-full sm:w-auto h-12 px-8 rounded-full font-medium transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? "Sending..." : "Send Message"}
                  </Button>
                </form>
              </div>
            </div>

            {/* Sidebar / Quick Links */}
            <div className="space-y-6">
              <div className="glass-card bg-white/70 dark:bg-zinc-900/70 backdrop-blur-xl border border-white/20 dark:border-white/10 rounded-3xl p-8 shadow-sm">
                <h3 className="text-lg font-semibold mb-4">Common Topics</h3>
                <div className="space-y-4">
                  {faqTopics.map((topic, i) => (
                    <div key={i} className="group cursor-pointer p-3 rounded-2xl hover:bg-black/5 dark:hover:bg-white/5 transition-colors duration-200 flex items-start gap-4">
                      <div className="mt-1 bg-primary/10 p-2 rounded-full">
                        {topic.icon}
                      </div>
                      <div>
                        <h4 className="font-medium text-foreground flex items-center gap-1">
                          {topic.title}
                          <ChevronRight className="w-4 h-4 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200 text-primary" />
                        </h4>
                        <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                          {topic.desc}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="glass-card bg-primary/10 dark:bg-primary/5 backdrop-blur-xl border border-primary/20 rounded-3xl p-8 shadow-sm text-center">
                <div className="mx-auto w-12 h-12 bg-primary/20 rounded-full flex items-center justify-center mb-4">
                  <Mail className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-lg font-semibold mb-2">Direct Email</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Prefer to email us directly? Reach out to our support team.
                </p>
                <a href="mailto:info@neophrontech.com" className="text-primary font-medium hover:underline inline-flex items-center gap-1">
                  info@neophrontech.com
                </a>
              </div>
            </div>
            
          </div>
        </div>
      </main>

      <Footer />
      <AuthModal open={authModalOpen} onClose={() => setAuthModalOpen(false)} initialTab={authTab} />
    </div>
  );
}
