import React from "react";
import { Link } from "wouter";
import { useTheme } from "next-themes";
import { Moon, Sun, Menu, X, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Navbar() {
  const { theme, setTheme } = useTheme();
  const [isScrolled, setIsScrolled] = React.useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

  React.useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const navLinks = [
    { label: "Features", href: "#features" },
    { label: "Communication", href: "#communication" },
    { label: "AI Voice", href: "#ai-voice" },
    { label: "Pricing", href: "#pricing" },
  ];

  return (
    <header 
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isScrolled ? "glass-card shadow-sm py-3" : "bg-transparent py-5"
      }`}
    >
      <div className="container mx-auto px-4 md:px-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground">
            <BarChart3 className="w-5 h-5" />
          </div>
          <span className="font-display font-bold text-xl tracking-tight">NeoApp</span>
        </div>

        <nav className="hidden md:flex items-center gap-8">
          {navLinks.map((link) => (
            <a 
              key={link.label} 
              href={link.href}
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              {link.label}
            </a>
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
          
          <div className="hidden md:block">
            <Button className="rounded-full px-6 shadow-md hover:shadow-lg transition-shadow">
              Get Started
            </Button>
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

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden absolute top-full left-0 right-0 glass-card border-t border-border/50 py-4 px-4 flex flex-col gap-4 shadow-xl">
          {navLinks.map((link) => (
            <a 
              key={link.label} 
              href={link.href}
              className="text-base font-medium text-foreground py-2 border-b border-border/50"
              onClick={() => setMobileMenuOpen(false)}
            >
              {link.label}
            </a>
          ))}
          <Button className="w-full mt-2 rounded-full">
            Get Started
          </Button>
        </div>
      )}
    </header>
  );
}
