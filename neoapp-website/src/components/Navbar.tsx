import React, { useState } from "react";
import { Link, useLocation } from "wouter";
import { useTheme } from "next-themes";
import { Moon, Sun, Menu, X, BarChart3, LogOut, LayoutDashboard, Settings, User as UserIcon, ChevronDown, ShieldCheck, FileText, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/AuthContext";
import { ProfileSettings } from "./ProfileSettings";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface NavbarProps {
  onOpenModal: () => void;
  onOpenAuthModal?: (tab: "login" | "signup") => void;
}

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000";

export function Navbar({ onOpenModal, onOpenAuthModal }: NavbarProps) {
  const { theme, setTheme } = useTheme();
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const { isAuthenticated, logout, user } = useAuth();
  const [, setLocation] = useLocation();

  React.useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const navLinks = [
    { label: "Features", href: "/#features" },
    { label: "Communication", href: "/#communication" },
    { label: "Pricing", href: "/#pricing" },
    {
      label: "Company",
      subLinks: [
        { label: "Privacy Policy", href: "/privacy", icon: ShieldCheck, description: "How we protect your data" },
        { label: "Terms of Service", href: "/terms", icon: FileText, description: "Rules for using our platform" },
        { label: "Delete Account", href: "/deleteaccount", icon: Trash2, description: "Manage your account status" }
      ]
    },

    { label: "About", href: "/about" }, 
    { label: "Support", href: "/support" },
  ];

  const handleNavClick = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    e.preventDefault();

    if (href.startsWith("/#")) {
      const hash = href.replace("/", ""); // gets "#pricing"
      const targetElement = document.querySelector(hash);

      if (targetElement) {
        // If element exists on current page, scroll to it smoothly
        targetElement.scrollIntoView({ behavior: "smooth" });
      } else {
        // If we are on a different page (e.g. dashboard), navigate to home with hash
        const baseUrl = import.meta.env.BASE_URL;
        window.location.href = `${baseUrl}${hash}`;
      }
    } else {
      // It's a standard path
      setLocation(href);
    }

    if (mobileMenuOpen) setMobileMenuOpen(false);
  };

  const getAvatarUrl = () => {
    if (user?.logo) {
      return user.logo.startsWith('http') ? user.logo : `${API_BASE}${user.logo}`;
    }
    return "";
  };

  return (
    <>
      <header
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${isScrolled ? "glass-card shadow-sm py-3" : "bg-transparent py-5"
          }`}
      >
        <div className="container mx-auto px-4 md:px-6 flex items-center justify-between">
          <Link href="/">
            <div className="flex items-center gap-2 cursor-pointer">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground">
                <BarChart3 className="w-5 h-5" />
              </div>
              <span className="font-display font-bold text-xl tracking-tight">NeoApp</span>
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-8">
            {navLinks.map((link) => (
              link.subLinks ? (
                <div key={link.label} className="relative group">
                  <button className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors py-2">
                    {link.label} <ChevronDown className="w-4 h-4 opacity-70 group-hover:rotate-180 transition-transform duration-200" />
                  </button>
                  <div className="absolute top-[calc(100%+0.5rem)] left-1/2 -translate-x-1/2 w-[320px] rounded-[24px] border border-white/80 dark:border-white/10 bg-white/70 dark:bg-[#0b0f19]/75 backdrop-blur-2xl p-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 shadow-[0_24px_50px_-12px_rgba(0,0,0,0.15)] dark:shadow-black/40 z-50 transform origin-top group-hover:translate-y-0 translate-y-2">
                    <div className="flex flex-col gap-1">
                      {link.subLinks.map((subLink) => {
                        const Icon = subLink.icon;
                        return (
                          <a
                            key={subLink.label}
                            href={subLink.href}
                            onClick={(e) => handleNavClick(e, subLink.href)}
                            className="group/link relative flex items-start gap-3 rounded-2xl p-3 hover:bg-white dark:hover:bg-white/10 transition-all duration-200"
                          >
                            {Icon && (
                              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200/50 dark:border-white/5 bg-slate-50 dark:bg-black/20 group-hover/link:bg-blue-50 dark:group-hover/link:bg-blue-500/10 group-hover/link:border-blue-200 dark:group-hover/link:border-blue-500/20 transition-colors">
                                <Icon className="h-5 w-5 text-slate-500 dark:text-slate-400 group-hover/link:text-blue-600 dark:group-hover/link:text-blue-400 transition-colors" />
                              </div>
                            )}
                            <div>
                              <div className="font-semibold text-[15px] text-slate-700 dark:text-slate-200 group-hover/link:text-blue-600 dark:group-hover/link:text-blue-400 transition-colors">{subLink.label}</div>
                              {subLink.description && (
                                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{subLink.description}</p>
                              )}
                            </div>
                          </a>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : (
                <a
                  key={link.label}
                  href={link.href}
                  onClick={(e) => handleNavClick(e, link.href)}
                  className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  {link.label}
                </a>
              )
            ))}
          </nav>

          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="rounded-full"
            >
              <Sun className="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
              <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
              <span className="sr-only">Toggle theme</span>
            </Button>

            <div className="hidden md:flex items-center gap-2">
              {isAuthenticated ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="relative h-10 w-10 rounded-full">
                      <Avatar className="h-10 w-10 border border-border shadow-sm">
                        <AvatarImage src={getAvatarUrl()} alt={user?.name} className="object-cover" />
                        <AvatarFallback className="bg-primary/10 text-primary">
                          {user?.name?.charAt(0).toUpperCase() || <UserIcon className="h-4 w-4" />}
                        </AvatarFallback>
                      </Avatar>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-56" align="end" forceMount>
                    <DropdownMenuLabel className="font-normal">
                      <div className="flex flex-col space-y-1">
                        <p className="text-sm font-medium leading-none">{user?.name}</p>
                        <p className="text-xs leading-none text-muted-foreground">
                          {user?.email}
                        </p>
                      </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setLocation('/dashboard')} className="cursor-pointer">
                      <LayoutDashboard className="mr-2 h-4 w-4" />
                      <span>Dashboard</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setProfileOpen(true)} className="cursor-pointer">
                      <Settings className="mr-2 h-4 w-4" />
                      <span>Profile Settings</span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={logout} className="cursor-pointer text-destructive focus:text-destructive">
                      <LogOut className="mr-2 h-4 w-4" />
                      <span>Log out</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <>
                  <Button
                    variant="ghost"
                    className="rounded-full px-6 font-medium"
                    onClick={() => onOpenAuthModal?.("login")}
                  >
                    Sign In
                  </Button>
                  <Button
                    className="rounded-full px-6 shadow-md hover:shadow-lg transition-shadow"
                    onClick={() => onOpenAuthModal?.("signup")}
                  >
                    Sign Up
                  </Button>
                </>
              )}
            </div>

            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden absolute top-full left-0 right-0 glass-card border-t border-border/50 py-4 px-4 flex flex-col gap-4 shadow-xl max-h-[80vh] overflow-y-auto">
            {navLinks.map((link) => (
              <div key={link.label} className="border-b border-border/50 pb-2">
                {link.subLinks ? (
                  <div className="flex flex-col gap-2">
                    <span className="text-base font-semibold text-foreground">{link.label}</span>
                    <div className="flex flex-col gap-1 pl-2 border-l-2 border-border/30 mt-1">
                      {link.subLinks.map((subLink) => {
                        const Icon = subLink.icon;
                        return (
                          <a
                            key={subLink.label}
                            href={subLink.href}
                            onClick={(e) => handleNavClick(e, subLink.href)}
                            className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-primary/5 hover:text-primary transition-colors"
                          >
                            {Icon && <Icon className="h-4 w-4" />}
                            {subLink.label}
                          </a>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <a
                    href={link.href}
                    className="text-base font-medium text-foreground py-2 block"
                    onClick={(e) => handleNavClick(e, link.href)}
                  >
                    {link.label}
                  </a>
                )}
              </div>
            ))}
            {isAuthenticated ? (
              <>
                <div className="flex items-center gap-3 py-2 border-b border-border/50">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={getAvatarUrl()} alt={user?.name} className="object-cover" />
                    <AvatarFallback>{user?.name?.charAt(0).toUpperCase() || <UserIcon className="h-4 w-4" />}</AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col">
                    <span className="font-medium text-sm">{user?.name}</span>
                    <span className="text-xs text-muted-foreground">{user?.email}</span>
                  </div>
                </div>
                <Button className="w-full mt-2 rounded-full" variant="secondary" onClick={() => { setMobileMenuOpen(false); setLocation('/dashboard'); }}>
                  <LayoutDashboard className="w-4 h-4 mr-2" /> Dashboard
                </Button>
                <Button className="w-full mt-2 rounded-full" variant="outline" onClick={() => { setMobileMenuOpen(false); setProfileOpen(true); }}>
                  <Settings className="w-4 h-4 mr-2" /> Profile Settings
                </Button>
                <Button variant="ghost" className="w-full rounded-full mt-2 text-destructive" onClick={() => { logout(); setMobileMenuOpen(false); }}>
                  <LogOut className="w-4 h-4 mr-2" /> Log out
                </Button>
              </>
            ) : (
              <>
                <Button className="w-full mt-2 rounded-full" variant="outline" onClick={() => { setMobileMenuOpen(false); onOpenAuthModal?.("login"); }}>
                  Sign In
                </Button>
                <Button className="w-full mt-2 rounded-full" onClick={() => { setMobileMenuOpen(false); onOpenAuthModal?.("signup"); }}>
                  Sign Up
                </Button>
              </>
            )}
          </div>
        )}
      </header>

      <ProfileSettings open={profileOpen} onClose={() => setProfileOpen(false)} />
    </>
  );
}
