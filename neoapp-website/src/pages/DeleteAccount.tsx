import React, { useEffect } from "react";
import {
  ArrowRight, BadgeCheck, Building2, CheckCircle2, ChevronRight,
  Clock3, Database, FileText, HelpCircle, LockKeyhole, Mail,
  PauseCircle, ShieldCheck, Sparkles, Smartphone, Trash2, UserRound, UsersRound
} from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";

const sections = [
  { id: "overview", label: "Overview", number: "01" },
  { id: "deletion-request", label: "Deletion Request", number: "02" },
  { id: "self-deletion", label: "In-App Deletion", number: "03" },
  { id: "data-purging", label: "Data Removal", number: "04" },
  { id: "contact", label: "Contact", number: "05" },
];

const purgeItems = [
  {
    icon: UsersRound,
    title: "Users & Roles",
    text: "Linked user profiles, staff credentials, role assignments, and administrator accounts associated with the workspace.",
    tone: "text-blue-600 bg-blue-500/10 border-blue-500/15",
  },
  {
    icon: FileText,
    title: "Enquiries & Follow-ups",
    text: "Customer enquiries, lead sources, products, assignments, follow-up entries, reminders, and activity history.",
    tone: "text-cyan-600 bg-cyan-500/10 border-cyan-500/15",
  },
  {
    icon: Mail,
    title: "Communication & Messages",
    text: "Chat records, WhatsApp configuration/history, email settings, custom templates, and notification logs.",
    tone: "text-violet-600 bg-violet-500/10 border-violet-500/15",
  },
  {
    icon: Database,
    title: "Billing & Workspace Records",
    text: "Workspace-linked subscription records, plan overrides, payment references, and support records, subject to lawful retention duties.",
    tone: "text-rose-600 bg-rose-500/10 border-rose-500/15",
  },
];

function SectionHeading({
  number,
  title,
  description,
}: {
  number: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="mb-7">
      <div className="mb-3 flex items-center gap-3">
        <span className="inline-flex h-8 min-w-8 items-center justify-center rounded-full border border-blue-500/15 bg-blue-500/10 px-2 text-xs font-bold text-blue-600 dark:text-blue-400">
          {number}
        </span>
        <div className="h-px w-10 bg-gradient-to-r from-blue-500/70 to-transparent" />
      </div>
      <h2 className="text-2xl font-bold tracking-[-0.03em] text-slate-950 dark:text-white sm:text-3xl">
        {title}
      </h2>
      {description && (
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400 sm:text-base">
          {description}
        </p>
      )}
    </div>
  );
}

function GlassCard({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-[28px] border border-white/70 bg-white/75 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.25)] backdrop-blur-2xl dark:border-white/10 dark:bg-white/[0.055] ${className}`}
    >
      {children}
    </div>
  );
}

export default function DeleteAccount() {
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, []);

  const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#f7f9fc] text-slate-900 dark:bg-[#070a12] dark:text-white">
      <Navbar onOpenModal={() => { }} onOpenAuthModal={() => { }} />

      {/* iOS-inspired ambient background */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-40 top-20 h-[420px] w-[420px] rounded-full bg-blue-400/15 blur-[110px] dark:bg-blue-600/10" />
        <div className="absolute -right-40 top-[32rem] h-[460px] w-[460px] rounded-full bg-violet-400/15 blur-[120px] dark:bg-violet-600/10" />
        <div className="absolute bottom-0 left-1/3 h-[380px] w-[380px] rounded-full bg-cyan-300/10 blur-[120px]" />
      </div>

      <main className="relative mx-auto w-full max-w-7xl px-4 pb-24 pt-24 sm:px-6 md:pt-32 lg:px-8">
        {/* Hero */}
        <section className="relative overflow-hidden rounded-[34px] border border-white/80 bg-white/80 px-5 py-10 shadow-[0_30px_100px_-45px_rgba(37,99,235,0.35)] backdrop-blur-2xl dark:border-white/10 dark:bg-white/[0.055] sm:px-10 sm:py-14 lg:px-14">
          <div className="absolute right-0 top-0 h-64 w-64 rounded-full bg-blue-500/10 blur-3xl" />
          <div className="relative grid items-center gap-10 lg:grid-cols-[1.2fr_.8fr]">
            <div>
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-blue-500/15 bg-blue-500/10 px-3.5 py-2 text-xs font-semibold text-blue-700 dark:text-blue-300">
                <ShieldCheck className="h-4 w-4" />
                Privacy & Account Control
              </div>

              <h1 className="max-w-4xl text-4xl font-black tracking-[-0.055em] text-slate-950 dark:text-white sm:text-5xl lg:text-6xl">
                Account deletion,
                <span className="block bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 bg-clip-text text-transparent">
                  designed with clarity.
                </span>
              </h1>

              <p className="mt-6 max-w-2xl text-base leading-7 text-slate-600 dark:text-slate-300 sm:text-lg">
                Request deletion of your Neo Groww CRM account and associated data,
                or review the controls available to eligible workspace administrators.
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                <a
                  href="mailto:info@neophrontech.com?subject=Neo%20Groww%20Account%20Deletion%20Request"
                  className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-slate-950/15 transition hover:-translate-y-0.5 dark:bg-white dark:text-slate-950"
                >
                  Request deletion <ArrowRight className="h-4 w-4" />
                </a>
                <button
                  onClick={() => scrollToSection("self-deletion")}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-5 py-3 text-sm font-semibold text-slate-800 transition hover:bg-white dark:border-white/10 dark:bg-white/5 dark:text-white"
                >
                  View in-app options <ChevronRight className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                <span className="inline-flex items-center gap-1.5"><BadgeCheck className="h-4 w-4 text-emerald-500" /> Identity verification</span>
                <span className="inline-flex items-center gap-1.5"><LockKeyhole className="h-4 w-4 text-blue-500" /> Secure processing</span>
                <span className="inline-flex items-center gap-1.5"><Clock3 className="h-4 w-4 text-violet-500" /> Up to 30 days</span>
              </div>
            </div>

            <div className="relative mx-auto w-full max-w-sm">
              <div className="rounded-[36px] border border-white/80 bg-gradient-to-b from-white to-blue-50/80 p-5 shadow-[0_30px_70px_-35px_rgba(37,99,235,0.45)] dark:border-white/10 dark:from-white/10 dark:to-blue-500/5">
                <div className="mx-auto mb-5 h-1.5 w-16 rounded-full bg-slate-200 dark:bg-white/15" />
                <div className="rounded-[26px] border border-slate-200/70 bg-white p-5 dark:border-white/10 dark:bg-[#0d1220]">
                  <div className="flex items-center justify-between">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-violet-600 text-white shadow-lg shadow-blue-500/20">
                      <UserRound className="h-6 w-6" />
                    </div>
                    <Sparkles className="h-5 w-5 text-blue-500" />
                  </div>
                  <h3 className="mt-5 text-xl font-bold">Your data. Your choice.</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
                    Transparent controls for account deletion, workspace suspension, and data removal.
                  </p>
                  <div className="mt-5 space-y-2.5">
                    {["Verified request", "Clear deletion scope", "Session revocation"].map((item) => (
                      <div key={item} className="flex items-center gap-2 rounded-2xl bg-slate-50 px-3 py-2.5 text-sm font-medium dark:bg-white/5">
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                        {item}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* iOS segmented navigation */}
        <div className="sticky top-20 z-30 mx-auto mt-6 max-w-4xl">
          <div className="flex gap-1 overflow-x-auto rounded-2xl border border-white/80 bg-white/75 p-1.5 shadow-lg shadow-slate-900/5 backdrop-blur-2xl [scrollbar-width:none] dark:border-white/10 dark:bg-[#0b0f19]/75">
            {sections.map((item) => (
              <button
                key={item.id}
                onClick={() => scrollToSection(item.id)}
                className="shrink-0 rounded-xl px-3.5 py-2 text-xs font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-950 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white sm:flex-1"
              >
                <span className="mr-1 text-blue-600 dark:text-blue-400">{item.number}</span>
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mx-auto mt-12 max-w-4xl">
          <GlassCard className="px-6 py-10 sm:p-12 lg:p-16 space-y-16">
            <section id="overview" className="scroll-mt-40">
              <SectionHeading
                number="01"
                title="Overview"
                description="A clear explanation of the deletion paths available to individuals and eligible workspace administrators."
              />
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-3xl bg-slate-50 p-5 dark:bg-white/5">
                  <UserRound className="h-6 w-6 text-blue-600" />
                  <h3 className="mt-4 font-bold">Individual account request</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
                    Contact support to request deletion of your Neo Groww CRM account and associated account data.
                  </p>
                </div>
                <div className="rounded-3xl bg-slate-50 p-5 dark:bg-white/5">
                  <Building2 className="h-6 w-6 text-violet-600" />
                  <h3 className="mt-4 font-bold">Workspace administration</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
                    Eligible Primary Admins can access workspace-level delete or disable controls inside the mobile app.
                  </p>
                </div>
              </div>
            </section>

            <hr className="border-slate-200/50 dark:border-white/5" />

            <section id="deletion-request" className="scroll-mt-40">
              <SectionHeading
                number="02"
                title="Account Deletion Request"
                description="Use the support-assisted path when you need help deleting an individual account or associated records."
              />
              <div className="grid gap-6 lg:grid-cols-[1fr_.72fr]">
                <div className="space-y-3">
                  {[
                    ["Send your request", "Email info@neophrontech.com from an address you can access."],
                    ["Provide account details", "Include your registered mobile number or email address."],
                    ["Complete verification", "We may verify identity and authority before processing."],
                    ["Deletion processing", "Verified requests are processed against the applicable account and associated data."],
                  ].map(([title, text], index) => (
                    <div key={title} className="flex gap-4 rounded-2xl border border-slate-200/70 bg-white/60 p-4 dark:border-white/10 dark:bg-white/[0.03]">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">{index + 1}</span>
                      <div>
                        <h3 className="text-sm font-bold">{title}</h3>
                        <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">{text}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="rounded-[26px] bg-gradient-to-br from-amber-50 to-orange-50 p-6 ring-1 ring-amber-200/60 dark:from-amber-500/10 dark:to-orange-500/5 dark:ring-amber-500/15">
                  <Clock3 className="h-7 w-7 text-amber-600" />
                  <h3 className="mt-4 text-lg font-bold">Processing window</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                    Support-assisted deletion requests may take up to <strong>30 days</strong> to process after required verification.
                  </p>
                  <a href="mailto:info@neophrontech.com?subject=Account%20Deletion%20Request" className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-amber-700 dark:text-amber-400">
                    Email support <ArrowRight className="h-4 w-4" />
                  </a>
                </div>
              </div>
            </section>

            <hr className="border-slate-200/50 dark:border-white/5" />

            <section id="self-deletion" className="scroll-mt-40">
              <SectionHeading
                number="03"
                title="In-App Self Deletion"
                description="Primary Admin controls are intentionally separated into permanent deletion and reversible access restriction."
              />
              <div className="grid gap-5 md:grid-cols-2">
                <div className="group rounded-[28px] border border-rose-200/70 bg-gradient-to-b from-rose-50/90 to-white p-6 transition hover:-translate-y-1 hover:shadow-xl hover:shadow-rose-500/10 dark:border-rose-500/15 dark:from-rose-500/10 dark:to-white/[0.02]">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-500 text-white shadow-lg shadow-rose-500/20">
                    <Trash2 className="h-6 w-6" />
                  </div>
                  <h3 className="mt-5 text-lg font-bold">Delete Company Account</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                    Permanently removes the eligible workspace and associated workspace records targeted by the deletion flow. This action is irreversible.
                  </p>
                  <div className="mt-4 inline-flex rounded-full bg-rose-500/10 px-3 py-1.5 text-xs font-bold text-rose-600 dark:text-rose-400">
                    Permanent action
                  </div>
                </div>

                <div className="group rounded-[28px] border border-blue-200/70 bg-gradient-to-b from-blue-50/90 to-white p-6 transition hover:-translate-y-1 hover:shadow-xl hover:shadow-blue-500/10 dark:border-blue-500/15 dark:from-blue-500/10 dark:to-white/[0.02]">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-500/20">
                    <PauseCircle className="h-6 w-6" />
                  </div>
                  <h3 className="mt-5 text-lg font-bold">Disable Company Account</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                    Restricts company login access and places the workspace into a suspended state without immediately deleting workspace data.
                  </p>
                  <div className="mt-4 inline-flex rounded-full bg-blue-500/10 px-3 py-1.5 text-xs font-bold text-blue-600 dark:text-blue-400">
                    Access restricted
                  </div>
                </div>
              </div>

              <div className="mt-6 flex items-start gap-3 rounded-2xl bg-slate-950 p-5 text-white dark:bg-white dark:text-slate-950">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
                <p className="text-sm leading-6">
                  In the mobile app, open <strong>Profile</strong>, scroll to the account controls, then choose the available delete or disable option. Confirmation is required to reduce accidental actions.
                </p>
              </div>

              <div className="mt-4 flex gap-3 rounded-2xl border border-violet-500/15 bg-violet-500/10 p-5">
                <Smartphone className="mt-0.5 h-5 w-5 shrink-0 text-violet-600" />
                <p className="text-sm font-semibold leading-6 text-violet-900 dark:text-violet-300">
                  <strong>iOS App Store Compliance:</strong> In accordance with Apple's App Store Review Guidelines (5.1.1(v)), our iOS application provides a clear, easily discoverable in-app account deletion option that completely removes your personal data and active sessions.
                </p>
              </div>
            </section>

            <hr className="border-slate-200/50 dark:border-white/5" />

            <section id="data-purging" className="scroll-mt-40">
              <SectionHeading
                number="04"
                title="Data Retention & Removal"
                description="The deletion process targets workspace-linked data across the core CRM system."
              />
              <div className="grid gap-4 md:grid-cols-2">
                {purgeItems.map(({ icon: Icon, title, text, tone }) => (
                  <div key={title} className="rounded-[24px] border border-slate-200/70 bg-white/60 p-5 dark:border-white/10 dark:bg-white/[0.03]">
                    <div className={`flex h-11 w-11 items-center justify-center rounded-2xl border ${tone}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <h3 className="mt-4 font-bold">{title}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">{text}</p>
                  </div>
                ))}
              </div>

              <div className="mt-6 rounded-[24px] border border-emerald-500/15 bg-emerald-500/10 p-5">
                <div className="flex gap-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                  <p className="text-sm font-medium leading-6 text-emerald-900 dark:text-emerald-300">
                    When deletion is finalized, relevant application caches are invalidated and active authentication sessions are revoked for the affected account or workspace.
                  </p>
                </div>
              </div>
            </section>

            <hr className="border-slate-200/50 dark:border-white/5" />

            <section id="contact" className="scroll-mt-40">
              <SectionHeading
                number="05"
                title="Contact Support"
                description="Questions about account deletion, verification, or workspace controls? Contact our team."
              />
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-[24px] bg-slate-50 p-5 dark:bg-white/5">
                  <Building2 className="h-6 w-6 text-blue-600" />
                  <h3 className="mt-4 font-bold">Neophron Technologies</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
                    #1, IV Floor, Lakini Towers,<br />
                    Brough Road, Erode,<br />
                    Tamil Nadu, India.
                  </p>
                </div>
                <div className="rounded-[24px] bg-slate-50 p-5 dark:bg-white/5">
                  <Mail className="h-6 w-6 text-violet-600" />
                  <h3 className="mt-4 font-bold">Digital Contact</h3>
                  <div className="mt-2 space-y-2 text-sm">
                    <a className="block font-medium text-blue-600 hover:underline dark:text-blue-400" href="mailto:info@neophrontech.com">info@neophrontech.com</a>
                    <a className="block font-medium text-blue-600 hover:underline dark:text-blue-400" href="https://www.neophrontech.com/" target="_blank" rel="noopener noreferrer">www.neophrontech.com</a>
                  </div>
                </div>
              </div>
            </section>
          </GlassCard>

          <div className="flex flex-col gap-3 rounded-[28px] border border-white/80 bg-white/75 mt-4 px-6 py-5 text-xs text-slate-500 backdrop-blur-2xl dark:border-white/10 dark:bg-[#0b0f19]/75 sm:flex-row sm:items-center sm:justify-between sm:px-9">
            <span>Last updated: May 26, 2026</span>
            <span className="inline-flex items-center gap-1.5"><HelpCircle className="h-4 w-4" /> Neo Groww CRM Account Deletion Policy</span>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}