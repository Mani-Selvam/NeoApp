import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle, Loader2, MessageCircle, User, Phone, Building2, MapPin } from "lucide-react";

interface GetStartedModalProps {
  open: boolean;
  onClose: () => void;
}

const API_BASE = import.meta.env.VITE_API_URL;

export function GetStartedModal({ open, onClose }: GetStartedModalProps) {
  const [form, setForm] = useState({ name: "", email: "", phone: "", company: "", city: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = "Name is required";
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errs.email = "Enter a valid email address";
    if (!form.phone.trim()) errs.phone = "Phone is required";
    else if (!/^\+?[\d\s\-()]{7,15}$/.test(form.phone.trim())) errs.phone = "Enter a valid phone number";
    if (!form.company.trim()) errs.company = "Company / business name is required";
    return errs;
  };

  const handleChange = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm(prev => ({ ...prev, [field]: e.target.value }));
    if (errors[field]) setErrors(prev => { const n = { ...prev }; delete n[field]; return n; });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    setStatus("loading");
    setErrorMsg("");
    try {
      const res = await fetch("/api/lead/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to submit");
      setStatus("success");
    } catch (err: unknown) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    }
  };

  const handleClose = () => {
    setForm({ name: "", email: "", phone: "", company: "", city: "" });
    setErrors({});
    setStatus("idle");
    setErrorMsg("");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md rounded-2xl p-0 overflow-hidden border-0 shadow-2xl">
        <div className="bg-gradient-to-br from-primary/10 via-background to-indigo-500/10 p-6 pb-0">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shadow-lg">
                <MessageCircle className="w-5 h-5 text-primary-foreground" />
              </div>
              <div>
                <DialogTitle className="text-xl font-bold">Get Started with NeoApp</DialogTitle>
                <DialogDescription className="text-sm text-muted-foreground">
                  We'll reach out via WhatsApp within minutes.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
        </div>

        <AnimatePresence mode="wait">
          {status === "success" ? (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="p-8 flex flex-col items-center text-center gap-4"
            >
              <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <CheckCircle className="w-9 h-9 text-green-500" />
              </div>
              <div>
                <h3 className="text-lg font-bold mb-1">You're on the list! 🎉</h3>
                <p className="text-sm text-muted-foreground">
                  We've received your details. Our team will contact you on WhatsApp shortly.
                </p>
              </div>
              <Button onClick={handleClose} className="rounded-full px-8 mt-2">
                Done
              </Button>
            </motion.div>
          ) : (
            <motion.form
              key="form"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              onSubmit={handleSubmit}
              className="p-6 space-y-4"
            >
              <div className="space-y-1.5">
                <Label htmlFor="name" className="text-sm font-medium flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-muted-foreground" /> Full Name *
                </Label>
                <Input
                  id="name"
                  placeholder="John Doe"
                  value={form.name}
                  onChange={handleChange("name")}
                  className={`rounded-xl h-11 ${errors.name ? "border-destructive" : ""}`}
                  disabled={status === "loading"}
                />
                {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-sm font-medium flex items-center gap-1.5">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg> Email Address <span className="text-muted-foreground text-xs font-normal">(optional)</span>
                </Label>
                <Input
                  id="email"
                  placeholder="john@example.com"
                  value={form.email}
                  onChange={handleChange("email")}
                  className={`rounded-xl h-11 ${errors.email ? "border-destructive" : ""}`}
                  disabled={status === "loading"}
                  type="email"
                />
                {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="phone" className="text-sm font-medium flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-muted-foreground" /> WhatsApp Number *
                </Label>
                <Input
                  id="phone"
                  placeholder="+91 99999 99999"
                  value={form.phone}
                  onChange={handleChange("phone")}
                  className={`rounded-xl h-11 ${errors.phone ? "border-destructive" : ""}`}
                  disabled={status === "loading"}
                  type="tel"
                />
                {errors.phone && <p className="text-xs text-destructive">{errors.phone}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="company" className="text-sm font-medium flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-muted-foreground" /> Company / Business Name *
                </Label>
                <Input
                  id="company"
                  placeholder="Acme Pvt. Ltd."
                  value={form.company}
                  onChange={handleChange("company")}
                  className={`rounded-xl h-11 ${errors.company ? "border-destructive" : ""}`}
                  disabled={status === "loading"}
                />
                {errors.company && <p className="text-xs text-destructive">{errors.company}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="city" className="text-sm font-medium flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-muted-foreground" /> City <span className="text-muted-foreground text-xs font-normal">(optional)</span>
                </Label>
                <Input
                  id="city"
                  placeholder="Chennai, Mumbai, etc."
                  value={form.city}
                  onChange={handleChange("city")}
                  className="rounded-xl h-11"
                  disabled={status === "loading"}
                />
              </div>

              {status === "error" && (
                <motion.p
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-sm text-destructive bg-destructive/10 rounded-xl px-4 py-3"
                >
                  {errorMsg}
                </motion.p>
              )}

              <div className="pt-2 flex flex-col gap-2">
                <Button
                  type="submit"
                  className="w-full rounded-xl h-12 text-base font-semibold shadow-lg"
                  disabled={status === "loading"}
                >
                  {status === "loading" ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Sending…</>
                  ) : (
                    <><MessageCircle className="w-4 h-4 mr-2" /> Send via WhatsApp</>
                  )}
                </Button>
                <p className="text-center text-xs text-muted-foreground">
                  No spam. We'll only contact you about NeoApp.
                </p>
              </div>
            </motion.form>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
