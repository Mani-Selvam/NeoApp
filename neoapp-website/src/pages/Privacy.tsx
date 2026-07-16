import React, { useEffect } from "react";
import {
  ArrowRight, BadgeCheck, Bell, Building2, CheckCircle2, ChevronRight,
  Database, FileText, Fingerprint, Image as ImageIcon, KeyRound, LockKeyhole,
  Mail, MessageSquare, Phone, Server, ShieldCheck, Smartphone, Sparkles, Trash2,
  UserRound, UsersRound, Wifi
} from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";

const navItems = [
  ["overview", "01", "Overview"],
  ["data-collected", "02", "Data"],
  ["how-we-use", "03", "Usage"],
  ["permissions", "04", "Permissions"],
  ["ios", "05", "iOS App"],
  ["data-sharing", "06", "Sharing"],
  ["data-retention", "07", "Security"],
  ["delete-account", "08", "Delete"],
  ["contact", "09", "Contact"],
];

const dataCards = [
  {
    icon: UserRound,
    title: "Account Details",
    text: "Name, email, mobile number, role, login credentials, and company or workspace information used to manage user accounts.",
    className: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  },
  {
    icon: UsersRound,
    title: "Workspace Records",
    text: "Customer enquiries, follow-up notes, staff assignments, lead details, message records, and other CRM data entered by your organization.",
    className: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  },
  {
    icon: Wifi,
    title: "Technical Data",
    text: "Device identifiers, notification tokens, app usage logs, and diagnostic data required for security, notifications, and reliability.",
    className: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
  },
];

const useItems = [
  ["Create and manage user accounts", UserRound],
  ["Store and sync CRM records across your team", Database],
  ["Send reminders and service notifications", Bell],
  ["Improve app stability, support, and security", ShieldCheck],
];

const permissions = [
  {
    icon: Phone,
    title: "Phone Calls",
    label: "CALL_PHONE",
    text: "Used only when a user taps to place a customer or follow-up call directly from NeoApp.",
  },
  {
    icon: ImageIcon,
    title: "Photos & Media",
    label: "User initiated",
    text: "Used only when a user selects a profile photo, workspace logo, attachment, or other media inside the app.",
  },
  {
    icon: Bell,
    title: "Notifications",
    label: "Optional",
    text: "Used for follow-up reminders, account alerts, updates, and other service-related notifications.",
  },
];

function SectionTitle({
  number,
  title,
  subtitle,
}: {
  number: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mb-7">
      <div className="mb-3 flex items-center gap-3">
        <span className="inline-flex h-8 min-w-8 items-center justify-center rounded-full border border-blue-500/15 bg-blue-500/10 px-2 text-xs font-bold text-blue-600 dark:text-blue-400">
          {number}
        </span>
        <div className="h-px w-10 bg-gradient-to-r from-blue-500 to-transparent" />
      </div>
      <h2 className="text-2xl font-black tracking-[-0.035em] text-slate-950 dark:text-white sm:text-3xl">
        {title}
      </h2>
      {subtitle && (
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400 sm:text-base">
          {subtitle}
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
    <div className={`rounded-[30px] border border-white/80 bg-white/75 shadow-[0_24px_70px_-38px_rgba(15,23,42,0.35)] backdrop-blur-2xl dark:border-white/10 dark:bg-white/[0.055] ${className}`}>
      {children}
    </div>
  );
}

export default function Privacy() {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const goTo = (id: string) =>
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#f6f8fc] text-slate-900 dark:bg-[#070a12] dark:text-white">
      <Navbar onOpenModal={() => {}} onOpenAuthModal={() => {}} />

      {/* Premium iOS ambient background */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-48 top-24 h-[460px] w-[460px] rounded-full bg-blue-400/15 blur-[120px] dark:bg-blue-600/10" />
        <div className="absolute -right-44 top-[34rem] h-[500px] w-[500px] rounded-full bg-violet-400/15 blur-[130px] dark:bg-violet-600/10" />
        <div className="absolute bottom-0 left-1/3 h-[420px] w-[420px] rounded-full bg-cyan-300/10 blur-[130px]" />
      </div>

      <main className="relative mx-auto w-full max-w-7xl px-4 pb-24 pt-24 sm:px-6 md:pt-32 lg:px-8">
        {/* Hero */}
        <section className="relative overflow-hidden rounded-[36px] border border-white/80 bg-white/80 px-5 py-10 shadow-[0_35px_110px_-50px_rgba(37,99,235,0.45)] backdrop-blur-2xl dark:border-white/10 dark:bg-white/[0.055] sm:px-10 sm:py-14 lg:px-14">
          <div className="absolute -right-20 -top-24 h-80 w-80 rounded-full bg-gradient-to-br from-blue-500/20 to-violet-500/10 blur-3xl" />
          <div className="relative grid items-center gap-10 lg:grid-cols-[1.18fr_.82fr]">
            <div>
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-blue-500/15 bg-blue-500/10 px-3.5 py-2 text-xs font-bold text-blue-700 dark:text-blue-300">
                <ShieldCheck className="h-4 w-4" />
                Privacy by design
              </div>

              <h1 className="max-w-4xl text-4xl font-black tracking-[-0.06em] text-slate-950 dark:text-white sm:text-5xl lg:text-6xl">
                Your data.
                <span className="block bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 bg-clip-text text-transparent">
                  Protected with clarity.
                </span>
              </h1>

              <p className="mt-6 max-w-2xl text-base leading-7 text-slate-600 dark:text-slate-300 sm:text-lg">
                Learn how NeoApp collects, uses, stores, and protects information
                across our CRM, website, and related services.
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                <button
                  onClick={() => goTo("data-collected")}
                  className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-slate-950/15 transition hover:-translate-y-0.5 dark:bg-white dark:text-slate-950"
                >
                  Explore our policy <ArrowRight className="h-4 w-4" />
                </button>
                <a
                  href="mailto:info@neophrontech.com?subject=Privacy%20Request"
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-5 py-3 text-sm font-bold text-slate-800 transition hover:bg-white dark:border-white/10 dark:bg-white/5 dark:text-white"
                >
                  Privacy request <Mail className="h-4 w-4" />
                </a>
              </div>

              <div className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                <span className="inline-flex items-center gap-1.5"><BadgeCheck className="h-4 w-4 text-emerald-500" /> No sale of personal data</span>
                <span className="inline-flex items-center gap-1.5"><LockKeyhole className="h-4 w-4 text-blue-500" /> Protected access</span>
                <span className="inline-flex items-center gap-1.5"><Fingerprint className="h-4 w-4 text-violet-500" /> User control</span>
              </div>
            </div>

            {/* iPhone-like privacy card */}
            <div className="mx-auto w-full max-w-sm">
              <div className="rounded-[38px] border border-white/80 bg-gradient-to-b from-white to-blue-50/80 p-5 shadow-[0_30px_80px_-35px_rgba(37,99,235,0.5)] dark:border-white/10 dark:from-white/10 dark:to-blue-500/5">
                <div className="mx-auto mb-5 h-1.5 w-16 rounded-full bg-slate-200 dark:bg-white/15" />
                <div className="rounded-[28px] border border-slate-200/70 bg-white p-5 dark:border-white/10 dark:bg-[#0d1220]">
                  <div className="flex items-center justify-between">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-violet-600 text-white shadow-lg shadow-blue-500/20">
                      <ShieldCheck className="h-6 w-6" />
                    </div>
                    <Sparkles className="h-5 w-5 text-blue-500" />
                  </div>
                  <h3 className="mt-5 text-xl font-black tracking-tight">Privacy Center</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
                    Clear controls. Purpose-limited access. Transparent data practices.
                  </p>
                  <div className="mt-5 space-y-2.5">
                    {[
                      ["Account protection", KeyRound],
                      ["Secure connections", LockKeyhole],
                      ["Deletion controls", Trash2],
                    ].map(([label, Icon]) => {
                      const I = Icon as React.ElementType;
                      return (
                        <div key={label as string} className="flex items-center gap-2.5 rounded-2xl bg-slate-50 px-3 py-2.5 text-sm font-semibold dark:bg-white/5">
                          <I className="h-4 w-4 text-emerald-500" />
                          {label as string}
                          <CheckCircle2 className="ml-auto h-4 w-4 text-blue-500" />
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* iOS segmented navigation */}
        <div className="sticky top-20 z-30 mx-auto mt-6 max-w-5xl">
          <div className="flex gap-1 overflow-x-auto rounded-2xl border border-white/80 bg-white/75 p-1.5 shadow-lg shadow-slate-900/5 backdrop-blur-2xl [scrollbar-width:none] dark:border-white/10 dark:bg-[#0b0f19]/75">
            {navItems.map(([id, number, label]) => (
              <button
                key={id}
                onClick={() => goTo(id)}
                className="shrink-0 rounded-xl px-3 py-2 text-xs font-bold text-slate-500 transition hover:bg-slate-100 hover:text-slate-950 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white"
              >
                <span className="mr-1 text-blue-600 dark:text-blue-400">{number}</span>
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="mx-auto mt-12 max-w-4xl">
          <GlassCard className="px-6 py-10 sm:p-12 lg:p-16 space-y-16">
            {/* Overview */}
            <section id="overview" className="scroll-mt-40">
              <SectionTitle
                number="01"
                title="Overview"
                subtitle="A straightforward explanation of how NeoApp handles information while delivering CRM and follow-up services."
              />
              <div className="grid gap-5 lg:grid-cols-[1fr_.75fr]">
                <div className="space-y-4 text-sm leading-7 text-slate-600 dark:text-slate-300 sm:text-base">
                  <p>
                    NeoApp is a business CRM and follow-up management platform designed to help teams
                    manage enquiries, staff activity, customer communication, reminders, and
                    payment-related workflows — all in one place.
                  </p>
                  <p>
                    This Privacy Policy explains how NeoApp collects, uses, stores, and protects
                    information when your organization uses the app, website, or related services.
                    We collect data needed to provide CRM features, maintain account access, improve
                    platform performance, and support business operations safely.
                  </p>
                </div>
                <div className="rounded-[26px] bg-gradient-to-br from-blue-50 to-violet-50 p-6 ring-1 ring-blue-100 dark:from-blue-500/10 dark:to-violet-500/10 dark:ring-white/10">
                  <ShieldCheck className="h-7 w-7 text-blue-600" />
                  <h3 className="mt-4 text-lg font-black">Our privacy approach</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                    Purpose-aware collection, controlled access, transparent choices, and practical security measures.
                  </p>
                </div>
              </div>
            </section>

            <hr className="border-slate-200/50 dark:border-white/5" />

            {/* Data */}
            <section id="data-collected" className="scroll-mt-40">
              <SectionTitle
                number="02"
                title="Data We Collect"
                subtitle="Information varies based on the features your organization chooses to use."
              />
              <div className="grid gap-4 md:grid-cols-3">
                {dataCards.map(({ icon: Icon, title, text, className }) => (
                  <div key={title} className="rounded-[26px] border border-slate-200/70 bg-white/60 p-5 dark:border-white/10 dark:bg-white/[0.03]">
                    <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${className}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <h3 className="mt-4 font-black">{title}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">{text}</p>
                  </div>
                ))}
              </div>
              <div className="mt-5 flex gap-3 rounded-2xl border border-cyan-500/15 bg-cyan-500/10 p-5">
                <ImageIcon className="mt-0.5 h-5 w-5 shrink-0 text-cyan-600" />
                <p className="text-sm leading-6 text-slate-700 dark:text-slate-300">
                  If your team uploads profile photos, company logos, attachments, or other media,
                  that content is stored to support the features you choose to use inside NeoApp.
                </p>
              </div>
            </section>

            <hr className="border-slate-200/50 dark:border-white/5" />

            {/* Usage */}
            <section id="how-we-use" className="scroll-mt-40">
              <SectionTitle
                number="03"
                title="How We Use Data"
                subtitle="Information supports the product experience, service operations, reliability, and account protection."
              />
              <div className="grid gap-4 sm:grid-cols-2">
                {useItems.map(([title, Icon]) => {
                  const I = Icon as React.ElementType;
                  return (
                    <div key={title as string} className="flex items-center gap-4 rounded-2xl bg-slate-50 p-4 dark:bg-white/5">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600">
                        <I className="h-5 w-5" />
                      </div>
                      <span className="text-sm font-bold">{title as string}</span>
                    </div>
                  );
                })}
              </div>
              <p className="mt-5 text-sm leading-7 text-slate-600 dark:text-slate-300">
                We may also use information to respond to support requests, generate business receipts
                or communication records, protect accounts from unauthorized access, and maintain core
                features such as follow-up reminders, team coordination, and workspace management.
              </p>
            </section>

            <hr className="border-slate-200/50 dark:border-white/5" />

            {/* Permissions */}
            <section id="permissions" className="scroll-mt-40">
              <SectionTitle
                number="04"
                title="Permissions"
                subtitle="Device permissions are requested only when needed for specific app features."
              />
              <div className="grid gap-4 md:grid-cols-3">
                {permissions.map(({ icon: Icon, title, label, text }) => (
                  <div key={title} className="rounded-[26px] border border-slate-200/70 bg-white/60 p-5 dark:border-white/10 dark:bg-white/[0.03]">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-500/10 text-violet-600">
                        <Icon className="h-5 w-5" />
                      </div>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-slate-500 dark:bg-white/10 dark:text-slate-400">
                        {label}
                      </span>
                    </div>
                    <h3 className="mt-4 font-black">{title}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">{text}</p>
                  </div>
                ))}
              </div>
              <div className="mt-5 flex gap-3 rounded-2xl border border-blue-500/15 bg-blue-500/10 p-5">
                <BadgeCheck className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
                <p className="text-sm font-semibold leading-6 text-blue-900 dark:text-blue-300">
                  The Play Store build is configured to avoid restricted call-log permissions.
                </p>
              </div>
            </section>

            <hr className="border-slate-200/50 dark:border-white/5" />

            {/* iOS App */}
            <section id="ios" className="scroll-mt-40">
              <SectionTitle
                number="05"
                title="iOS App"
                subtitle="NeoApp is available on the Apple App Store. Additional disclosures apply to the iOS version."
              />
              <div className="grid gap-5 md:grid-cols-2">
                <div className="rounded-[26px] border border-slate-200/70 bg-white/60 p-6 dark:border-white/10 dark:bg-white/[0.03]">
                  <Smartphone className="h-7 w-7 text-blue-600" />
                  <h3 className="mt-4 text-lg font-black">App Store Distribution</h3>
                  <p className="mt-2 text-sm leading-7 text-slate-600 dark:text-slate-300">
                    The iOS version of NeoApp is distributed exclusively through the Apple App Store
                    and complies with Apple's App Store Review Guidelines and privacy requirements.
                    Apple may collect usage data under its own privacy policy, separate from ours.
                  </p>
                </div>
                <div className="rounded-[26px] border border-slate-200/70 bg-white/60 p-6 dark:border-white/10 dark:bg-white/[0.03]">
                  <ShieldCheck className="h-7 w-7 text-violet-600" />
                  <h3 className="mt-4 text-lg font-black">No Cross-App Tracking</h3>
                  <p className="mt-2 text-sm leading-7 text-slate-600 dark:text-slate-300">
                    NeoApp does not use Apple's Advertising Identifier (IDFA) and does not track
                    users across third-party apps or websites for advertising purposes. We do not
                    participate in data brokering or ad networks.
                  </p>
                </div>
              </div>

              <div className="mt-5 space-y-3">
                {[
                  { label: "Photos & Media", desc: "Accessed only when you actively select a photo or file from your library inside the app (e.g. profile picture, logo upload). We do not scan or access your photo library automatically.", color: "bg-blue-500/10 text-blue-600" },
                  { label: "Camera", desc: "Used only when you choose to take a photo directly within NeoApp for upload purposes. Camera access is not used in the background.", color: "bg-violet-500/10 text-violet-600" },
                  { label: "Notifications (iOS)", desc: "Push notifications are requested once and used to deliver follow-up reminders, account alerts, and service updates. You can revoke this permission at any time in iOS Settings.", color: "bg-emerald-500/10 text-emerald-600" },
                  { label: "Local Network", desc: "If your organization operates within a private network, the app may request local network access to connect to internal services.", color: "bg-amber-500/10 text-amber-700" },
                ].map(({ label, desc, color }) => (
                  <div key={label} className="flex gap-4 rounded-2xl border border-slate-200/70 bg-white/60 p-4 dark:border-white/10 dark:bg-white/[0.03]">
                    <span className={`mt-0.5 shrink-0 rounded-xl px-2.5 py-1 text-xs font-black ${color}`}>{label}</span>
                    <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">{desc}</p>
                  </div>
                ))}
              </div>

              <div className="mt-5 flex gap-3 rounded-2xl border border-blue-500/15 bg-blue-500/10 p-5">
                <BadgeCheck className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
                <p className="text-sm font-semibold leading-6 text-blue-900 dark:text-blue-300">
                  All iOS permission prompts include a plain-language description of why the permission is needed.
                  Permissions are never requested silently or without clear user intent.
                </p>
              </div>
            </section>

            <hr className="border-slate-200/50 dark:border-white/5" />

            {/* Sharing */}
            <section id="data-sharing" className="scroll-mt-40">
              <SectionTitle
                number="06"
                title="Data Sharing"
                subtitle="We do not sell personal data."
              />
              <div className="grid gap-5 md:grid-cols-2">
                <div className="rounded-[26px] bg-emerald-500/10 p-6 ring-1 ring-emerald-500/15">
                  <CheckCircle2 className="h-7 w-7 text-emerald-600" />
                  <h3 className="mt-4 text-lg font-black">Trusted service providers</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                    Information may be processed by providers used for hosting, authentication,
                    notifications, payments, email, or messaging as required to operate the app.
                    Access is limited to information needed to perform those services.
                  </p>
                </div>
                <div className="rounded-[26px] bg-amber-500/10 p-6 ring-1 ring-amber-500/15">
                  <FileText className="h-7 w-7 text-amber-600" />
                  <h3 className="mt-4 text-lg font-black">Legal and safety needs</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                    Information may be disclosed when required by law, regulation, legal process,
                    or to protect the rights, safety, and security of NeoApp, users, or the public.
                  </p>
                </div>
              </div>
            </section>

            <hr className="border-slate-200/50 dark:border-white/5" />

            {/* Retention */}
            <section id="data-retention" className="scroll-mt-40">
              <SectionTitle
                number="07"
                title="Data Retention & Security"
                subtitle="Retention depends on the record, operational needs, and applicable obligations."
              />
              <div className="grid gap-5 md:grid-cols-2">
                <div className="rounded-[26px] border border-slate-200/70 p-6 dark:border-white/10">
                  <Database className="h-7 w-7 text-blue-600" />
                  <h3 className="mt-4 text-lg font-black">Retention</h3>
                  <p className="mt-2 text-sm leading-7 text-slate-600 dark:text-slate-300">
                    Data is retained while your account remains active. Periods may vary depending on
                    record type, operational needs, billing requirements, disputes, backup cycles, and
                    legal obligations. When data is no longer required, we aim to remove or anonymize it where reasonably possible.
                  </p>
                </div>
                <div className="rounded-[26px] border border-slate-200/70 p-6 dark:border-white/10">
                  <Server className="h-7 w-7 text-violet-600" />
                  <h3 className="mt-4 text-lg font-black">Security</h3>
                  <p className="mt-2 text-sm leading-7 text-slate-600 dark:text-slate-300">
                    Security efforts may include authenticated access controls, protected APIs,
                    encrypted connections, logging, role-based access practices, and monitoring.
                    No system can guarantee absolute security.
                  </p>
                </div>
              </div>
            </section>

            <hr className="border-slate-200/50 dark:border-white/5" />

            {/* Delete */}
            <section id="delete-account" className="scroll-mt-40">
              <SectionTitle
                number="08"
                title="Delete Account"
                subtitle="Request deletion through support or review the dedicated account deletion process."
              />
              <div className="overflow-hidden rounded-[28px] border border-rose-500/15 bg-gradient-to-br from-rose-50 to-white dark:from-rose-500/10 dark:to-white/[0.02]">
                <div className="grid items-center gap-6 p-6 md:grid-cols-[1fr_auto] md:p-8">
                  <div>
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-500 text-white shadow-lg shadow-rose-500/20">
                      <Trash2 className="h-6 w-6" />
                    </div>
                    <h3 className="mt-5 text-xl font-black">You remain in control.</h3>
                    <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-600 dark:text-slate-300">
                      Users can request deletion of their Neo Groww CRM account and associated data
                      by contacting support or visiting the dedicated deletion page. Include your
                      registered mobile number or email address for verification.
                    </p>
                  </div>
                  <div className="flex flex-col gap-3">
                    <a
                      href="/deleteaccount"
                      className="inline-flex items-center justify-center gap-2 rounded-full bg-rose-500 px-5 py-3 text-sm font-black text-white transition hover:-translate-y-0.5"
                    >
                      Deletion page <ArrowRight className="h-4 w-4" />
                    </a>
                    <a
                      href="mailto:info@neophrontech.com?subject=Account%20Deletion%20Request"
                      className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-800 dark:border-white/10 dark:bg-white/5 dark:text-white"
                    >
                      Email support
                    </a>
                  </div>
                </div>
              </div>
            </section>

            <hr className="border-slate-200/50 dark:border-white/5" />

            {/* Contact */}
            <section id="contact" className="scroll-mt-40">
              <SectionTitle
                number="09"
                title="Contact Us"
                subtitle="For privacy questions or requests, contact the NeoApp support team."
              />
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-[24px] bg-slate-50 p-5 dark:bg-white/5">
                  <Building2 className="h-6 w-6 text-blue-600" />
                  <h3 className="mt-4 font-black">Neophron Technologies</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
                    #1, IV Floor, Lakini Towers,<br />
                    Brough Road, Erode,<br />
                    Tamil Nadu, India.
                  </p>
                </div>
                <div className="rounded-[24px] bg-slate-50 p-5 dark:bg-white/5">
                  <MessageSquare className="h-6 w-6 text-violet-600" />
                  <h3 className="mt-4 font-black">Digital Contact</h3>
                  <div className="mt-2 space-y-2 text-sm">
                    <a href="mailto:info@neophrontech.com" className="block font-bold text-blue-600 hover:underline dark:text-blue-400">
                      info@neophrontech.com
                    </a>
                    <a href="https://www.neophrontech.com/" target="_blank" rel="noopener noreferrer" className="block font-bold text-blue-600 hover:underline dark:text-blue-400">
                      www.neophrontech.com
                    </a>
                  </div>
                </div>
              </div>
            </section>
          </GlassCard>
          
          {/* Footer Info */}
          <div className="flex flex-col gap-2 rounded-[28px] border border-white/80 bg-white/75 mt-4 px-6 py-5 text-xs font-medium text-slate-500 backdrop-blur-2xl dark:border-white/10 dark:bg-[#0b0f19]/75 sm:flex-row sm:items-center sm:justify-between sm:px-9">
            <span>Effective Date: May 26, 2026</span>
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4" /> NeoApp Privacy Policy
            </span>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}