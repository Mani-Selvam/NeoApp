import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Mail, Phone, Lock, LogIn, UserPlus, User, Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  initialTab?: "login" | "signup";
}

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000";

export function AuthModal({ open, onClose, onSuccess, initialTab = "login" }: AuthModalProps) {
  const [activeTab, setActiveTab] = useState<"login" | "signup">(initialTab);
  const [step, setStep] = useState<1 | 2>(1); // Step 2 is for OTP verification in signup
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [, setLocation] = useLocation();
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showSignupPassword, setShowSignupPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  React.useEffect(() => {
    if (open) {
      setActiveTab(initialTab);
      setStep(1);
      setStatus("idle");
      setErrorMsg("");
      setShowLoginPassword(false);
      setShowSignupPassword(false);
      setShowConfirmPassword(false);
    }
  }, [open, initialTab]);

  // Form State
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    mobile: "",
    password: "",
    confirmPassword: "",
    otp: "",
  });

  const { login } = useAuth();
  const { toast } = useToast();

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.id]: e.target.value });
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.email.trim() || !formData.password.trim()) {
      setErrorMsg("Please enter both email and password.");
      setStatus("error");
      return;
    }

    setStatus("loading");
    setErrorMsg("");

    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: formData.email,
          password: formData.password,
        }),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data?.message || "Login failed");

      login(data.token, data.user);

      setStatus("idle");
      onClose();
      toast({
        title: "Logged in successfully!",
        description: "Welcome back.",
      });
      if (onSuccess) onSuccess();
      setLocation("/dashboard");
    } catch (err: any) {
      setStatus("error");
      setErrorMsg(err.message || "Invalid credentials.");
    }
  };

  const handleSignupStep1 = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.email || !formData.mobile || !formData.password || !formData.confirmPassword) {
      setErrorMsg("All fields are required.");
      setStatus("error");
      return;
    }
    if (formData.password !== formData.confirmPassword) {
      setErrorMsg("Passwords do not match.");
      setStatus("error");
      return;
    }
    if (formData.password.length < 8) {
      setErrorMsg("Password must be at least 8 characters.");
      setStatus("error");
      return;
    }

    setStatus("loading");
    setErrorMsg("");

    try {
      // Send OTP to email or mobile
      const res = await fetch(`${API_BASE}/auth/send-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: formData.email,
          mobile: formData.mobile,
          type: "signup",
        }),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data?.message || "Failed to send OTP");

      setStatus("idle");
      setStep(2);
      toast({
        title: "OTP Sent!",
        description: "Please check your email and WhatsApp for the verification code.",
      });
    } catch (err: any) {
      setStatus("error");
      setErrorMsg(err.message || "Could not send OTP. Please try again.");
    }
  };

  const handleSignupStep2 = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.otp.trim() || formData.otp.length < 6) {
      setErrorMsg("Please enter a valid 6-digit OTP");
      setStatus("error");
      return;
    }

    setStatus("loading");
    setErrorMsg("");

    try {
      const res = await fetch(`${API_BASE}/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name,
          email: formData.email,
          mobile: formData.mobile,
          password: formData.password,
          confirmPassword: formData.confirmPassword,
          otp: formData.otp,
          privacyPolicyAccepted: true,
        }),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data?.message || "Registration failed");

      login(data.token, data.user);

      setStatus("idle");
      onClose();
      toast({
        title: "Account created successfully!",
        description: "Welcome to NeoApp.",
      });
      if (onSuccess) onSuccess();
      setLocation("/dashboard");
    } catch (err: any) {
      setStatus("error");
      setErrorMsg(err.message || "Registration failed.");
    }
  };

  const resetState = () => {
    setStep(1);
    setActiveTab("login");
    setFormData({
      name: "",
      email: "",
      mobile: "",
      password: "",
      confirmPassword: "",
      otp: "",
    });
    setStatus("idle");
    setErrorMsg("");
    setShowLoginPassword(false);
    setShowSignupPassword(false);
    setShowConfirmPassword(false);
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      if (!isOpen) onClose();
      else resetState();
    }}>
      <DialogContent className="sm:max-w-md rounded-2xl p-0 overflow-hidden border-0 shadow-2xl">
        <div className="bg-gradient-to-br from-primary/10 via-background to-indigo-500/10 p-6 pb-0">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shadow-lg">
                {activeTab === "login" ? (
                  <LogIn className="w-5 h-5 text-primary-foreground" />
                ) : (
                  <UserPlus className="w-5 h-5 text-primary-foreground" />
                )}
              </div>
              <div>
                <DialogTitle className="text-xl font-bold">
                  {step === 2 ? "Verify OTP" : activeTab === "login" ? "Welcome Back" : "Create Account"}
                </DialogTitle>
                <DialogDescription className="text-sm text-muted-foreground">
                  {step === 2
                    ? "Enter the 6-digit code sent to you"
                    : activeTab === "login"
                      ? "Sign in to manage your CRM and plans"
                      : "Sign up to start growing your business"}
                </DialogDescription>
              </div>
            </div>
            {step === 1 && (
              <div className="flex gap-2 p-1 bg-muted rounded-xl mb-2">
                <Button
                  variant={activeTab === "login" ? "default" : "ghost"}
                  className={`flex-1 rounded-lg h-9 ${activeTab === "login" ? "shadow-sm" : ""}`}
                  onClick={() => { setActiveTab("login"); setErrorMsg(""); }}
                >
                  Log In
                </Button>
                <Button
                  variant={activeTab === "signup" ? "default" : "ghost"}
                  className={`flex-1 rounded-lg h-9 ${activeTab === "signup" ? "shadow-sm" : ""}`}
                  onClick={() => { setActiveTab("signup"); setErrorMsg(""); }}
                >
                  Sign Up
                </Button>
              </div>
            )}
          </DialogHeader>
        </div>

        <AnimatePresence mode="wait">
          {activeTab === "login" && step === 1 && (
            <motion.form
              key="login"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              onSubmit={handleLogin}
              className="p-6 space-y-4 max-h-[70vh] overflow-y-auto"
            >
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-sm font-medium flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-muted-foreground" /> Email Address
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="name@example.com"
                  value={formData.email}
                  onChange={handleInputChange}
                  className="rounded-xl h-11"
                  disabled={status === "loading"}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-sm font-medium flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-muted-foreground" /> Password
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showLoginPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={formData.password}
                    onChange={handleInputChange}
                    className="rounded-xl h-11 pr-10"
                    disabled={status === "loading"}
                  />
                  <button
                    type="button"
                    onClick={() => setShowLoginPassword(!showLoginPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus:outline-none"
                    tabIndex={-1}
                  >
                    {showLoginPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              {status === "error" && (
                <p className="text-sm text-destructive bg-destructive/10 rounded-xl px-4 py-3">
                  {errorMsg}
                </p>
              )}

              <Button
                type="submit"
                className="w-full rounded-xl h-12 text-base font-semibold shadow-lg mt-2"
                disabled={status === "loading"}
              >
                {status === "loading" ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Signing in...</>
                ) : (
                  "Log in"
                )}
              </Button>
            </motion.form>
          )}

          {activeTab === "signup" && step === 1 && (
            <motion.form
              key="signup-step1"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              onSubmit={handleSignupStep1}
              className="p-6 space-y-4 max-h-[70vh] overflow-y-auto"
            >
              <div className="space-y-1.5">
                <Label htmlFor="name" className="text-sm font-medium flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-muted-foreground" /> Full Name
                </Label>
                <Input
                  id="name"
                  type="text"
                  placeholder="John Doe"
                  value={formData.name}
                  onChange={handleInputChange}
                  className="rounded-xl h-11"
                  disabled={status === "loading"}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-sm font-medium flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-muted-foreground" /> Email Address
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="name@example.com"
                  value={formData.email}
                  onChange={handleInputChange}
                  className="rounded-xl h-11"
                  disabled={status === "loading"}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="mobile" className="text-sm font-medium flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-muted-foreground" /> WhatsApp Number
                </Label>
                <Input
                  id="mobile"
                  type="tel"
                  placeholder="+91 9999999999"
                  value={formData.mobile}
                  onChange={handleInputChange}
                  className="rounded-xl h-11"
                  disabled={status === "loading"}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="password" className="text-sm font-medium flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-muted-foreground" /> Password
                  </Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showSignupPassword ? "text" : "password"}
                      placeholder="••••••••"
                      value={formData.password}
                      onChange={handleInputChange}
                      className="rounded-xl h-11 pr-10"
                      disabled={status === "loading"}
                    />
                    <button
                      type="button"
                      onClick={() => setShowSignupPassword(!showSignupPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus:outline-none"
                      tabIndex={-1}
                    >
                      {showSignupPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="confirmPassword" className="text-sm font-medium flex items-center gap-1.5 text-nowrap">
                    <Lock className="w-3.5 h-3.5 text-muted-foreground" /> Confirm Password
                  </Label>
                  <div className="relative">
                    <Input
                      id="confirmPassword"
                      type={showConfirmPassword ? "text" : "password"}
                      placeholder="••••••••"
                      value={formData.confirmPassword}
                      onChange={handleInputChange}
                      className="rounded-xl h-11 pr-10"
                      disabled={status === "loading"}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus:outline-none"
                      tabIndex={-1}
                    >
                      {showConfirmPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {status === "error" && (
                <p className="text-sm text-destructive bg-destructive/10 rounded-xl px-4 py-3">
                  {errorMsg}
                </p>
              )}

              <Button
                type="submit"
                className="w-full rounded-xl h-12 text-base font-semibold shadow-lg mt-2"
                disabled={status === "loading"}
              >
                {status === "loading" ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Sending OTP...</>
                ) : (
                  "Create Account"
                )}
              </Button>
            </motion.form>
          )}

          {activeTab === "signup" && step === 2 && (
            <motion.form
              key="signup-step2"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              onSubmit={handleSignupStep2}
              className="p-6 space-y-4 max-h-[70vh] overflow-y-auto"
            >
              <div className="space-y-1.5">
                <Label htmlFor="otp" className="text-sm font-medium flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-muted-foreground" /> One-Time Password
                </Label>
                <Input
                  id="otp"
                  placeholder="123456"
                  maxLength={6}
                  value={formData.otp}
                  onChange={handleInputChange}
                  className="rounded-xl h-11 text-center tracking-[0.5em] text-xl font-bold"
                  disabled={status === "loading"}
                />
              </div>

              {status === "error" && (
                <p className="text-sm text-destructive bg-destructive/10 rounded-xl px-4 py-3">
                  {errorMsg}
                </p>
              )}

              <Button
                type="submit"
                className="w-full rounded-xl h-12 text-base font-semibold shadow-lg"
                disabled={status === "loading"}
              >
                {status === "loading" ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Verifying...</>
                ) : (
                  "Verify & Complete"
                )}
              </Button>

              <div className="text-center">
                <Button
                  variant="link"
                  className="text-xs text-muted-foreground"
                  onClick={() => setStep(1)}
                  type="button"
                >
                  Back to Details
                </Button>
              </div>
            </motion.form>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
