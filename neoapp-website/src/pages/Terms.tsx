import React, { useEffect } from "react";
import {
  ArrowRight,
  BadgeCheck,
  Ban,
  BookOpen,
  Building2,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  FileCheck2,
  Fingerprint,
  Gavel,
  KeyRound,
  LockKeyhole,
  Mail,
  MessageSquare,
  Scale,
  ShieldCheck,
  Sparkles,
  Smartphone,
  UserCheck,
  UsersRound,
  XCircle,
} from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";

const navItems = [
  ["acceptance", "01", "Acceptance"],
  ["service-description", "02", "Service"],
  ["user-responsibilities", "03", "Responsibilities"],
  ["data-privacy", "04", "Privacy"],
  ["limitations", "05", "Liability"],
  ["app-store", "06", "App Store"],
  ["termination", "07", "Termination"],
  ["contact", "08", "Contact"],
];

const responsibilities = [
  {
    icon: KeyRound,
    title: "Protect credentials",
    text: "Maintain the confidentiality and security of your account credentials.",
  },
  {
    icon: FileCheck2,
    title: "Use lawful data",
    text: "Ensure information entered into the platform complies with applicable laws.",
  },
  {
    icon: Ban,
    title: "Avoid misuse",
    text: "Do not use NeoApp for unlawful activity, abuse, unauthorized access, or spam.",
  },
  {
    icon: CircleAlert,
    title: "Report incidents",
    text: "Notify us promptly if you become aware of suspected unauthorized account access.",
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
    <div
      className={`rounded-[30px] border border-white/80 bg-white/75 shadow-[0_24px_70px_-38px_rgba(15,23,42,0.35)] backdrop-blur-2xl dark:border-white/10 dark:bg-white/[0.055] ${className}`}
    >
      {children}
    </div>
  );
}

export default function Terms() {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const goTo = (id: string) => {
    document
      .getElementById(id)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#f6f8fc] text-slate-900 dark:bg-[#070a12] dark:text-white">
      <Navbar onOpenModal={() => { }} onOpenAuthModal={() => { }} />

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
                <Scale className="h-4 w-4" />
                Clear terms. Fair expectations.
              </div>

              <h1 className="max-w-4xl text-4xl font-black tracking-[-0.06em] text-slate-950 dark:text-white sm:text-5xl lg:text-6xl">
                Terms built for
                <span className="block bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 bg-clip-text text-transparent">
                  confident business.
                </span>
              </h1>

              <p className="mt-6 max-w-2xl text-base leading-7 text-slate-600 dark:text-slate-300 sm:text-lg">
                Please review the rules, responsibilities, service conditions,
                and account guidelines that apply when using NeoApp.
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                <button
                  onClick={() => goTo("acceptance")}
                  className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-slate-950/15 transition hover:-translate-y-0.5 dark:bg-white dark:text-slate-950"
                >
                  Read the terms <ArrowRight className="h-4 w-4" />
                </button>

                <a
                  href="mailto:info@neophrontech.com?subject=Terms%20of%20Service%20Question"
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-5 py-3 text-sm font-bold text-slate-800 transition hover:bg-white dark:border-white/10 dark:bg-white/5 dark:text-white"
                >
                  Ask a question <Mail className="h-4 w-4" />
                </a>
              </div>

              <div className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                <span className="inline-flex items-center gap-1.5">
                  <BadgeCheck className="h-4 w-4 text-emerald-500" />
                  Clear responsibilities
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <LockKeyhole className="h-4 w-4 text-blue-500" />
                  Privacy aligned
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Fingerprint className="h-4 w-4 text-violet-500" />
                  Account control
                </span>
              </div>
            </div>

            {/* iPhone-inspired terms card */}
            <div className="mx-auto w-full max-w-sm">
              <div className="rounded-[38px] border border-white/80 bg-gradient-to-b from-white to-blue-50/80 p-5 shadow-[0_30px_80px_-35px_rgba(37,99,235,0.5)] dark:border-white/10 dark:from-white/10 dark:to-blue-500/5">
                <div className="mx-auto mb-5 h-1.5 w-16 rounded-full bg-slate-200 dark:bg-white/15" />

                <div className="rounded-[28px] border border-slate-200/70 bg-white p-5 dark:border-white/10 dark:bg-[#0d1220]">
                  <div className="flex items-center justify-between">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-violet-600 text-white shadow-lg shadow-blue-500/20">
                      <Gavel className="h-6 w-6" />
                    </div>
                    <Sparkles className="h-5 w-5 text-blue-500" />
                  </div>

                  <h3 className="mt-5 text-xl font-black tracking-tight">
                    Terms Center
                  </h3>

                  <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
                    A simple overview of the commitments that support responsible
                    use of NeoApp.
                  </p>

                  <div className="mt-5 space-y-2.5">
                    {[
                      ["Responsible use", UserCheck],
                      ["Data ownership", ShieldCheck],
                      ["Account protection", KeyRound],
                    ].map(([label, Icon]) => {
                      const I = Icon as React.ElementType;

                      return (
                        <div
                          key={label as string}
                          className="flex items-center gap-2.5 rounded-2xl bg-slate-50 px-3 py-2.5 text-sm font-semibold dark:bg-white/5"
                        >
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
                <span className="mr-1 text-blue-600 dark:text-blue-400">
                  {number}
                </span>
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="mx-auto mt-12 max-w-4xl">
          <GlassCard className="px-6 py-10 sm:p-12 lg:p-16 space-y-16">
            {/* 01 */}
            <section id="acceptance" className="scroll-mt-40">
              <SectionTitle
                number="01"
                title="Acceptance of Terms"
                subtitle="Using NeoApp means agreeing to the terms that govern access to the platform."
              />

              <div className="grid gap-5 lg:grid-cols-[1fr_.75fr]">
                <div className="text-sm leading-7 text-slate-600 dark:text-slate-300 sm:text-base">
                  <p>
                    By accessing or using the NeoApp platform, you agree to be
                    bound by these Terms of Service and our Privacy Policy. If
                    you do not agree to these terms, you may not use the
                    platform.
                  </p>
                </div>

                <div className="rounded-[26px] bg-gradient-to-br from-blue-50 to-violet-50 p-6 ring-1 ring-blue-100 dark:from-blue-500/10 dark:to-violet-500/10 dark:ring-white/10">
                  <FileCheck2 className="h-7 w-7 text-blue-600" />
                  <h3 className="mt-4 text-lg font-black">
                    Before you continue
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                    Review these terms together with the Privacy Policy so you
                    understand both platform rules and data practices.
                  </p>
                </div>
              </div>
            </section>

            <hr className="border-slate-200/50 dark:border-white/5" />

            {/* 02 */}
            <section id="service-description" className="scroll-mt-40">
              <SectionTitle
                number="02"
                title="Service Description"
                subtitle="NeoApp provides CRM tools that support customer relationships, follow-ups, and business workflows."
              />

              <div className="grid gap-4 md:grid-cols-3">
                {[
                  {
                    icon: UsersRound,
                    title: "Lead Management",
                    text: "Organize enquiries, customer records, assignments, and lead workflows.",
                    tone: "bg-blue-500/10 text-blue-600",
                  },
                  {
                    icon: MessageSquare,
                    title: "Communication",
                    text: "Support follow-ups and customer communication through enabled platform features.",
                    tone: "bg-violet-500/10 text-violet-600",
                  },
                  {
                    icon: BookOpen,
                    title: "Sales Tracking",
                    text: "Track activities, follow-up progress, and business workflow information.",
                    tone: "bg-cyan-500/10 text-cyan-600",
                  },
                ].map(({ icon: Icon, title, text, tone }) => (
                  <div
                    key={title}
                    className="rounded-[26px] border border-slate-200/70 bg-white/60 p-5 dark:border-white/10 dark:bg-white/[0.03]"
                  >
                    <div
                      className={`flex h-11 w-11 items-center justify-center rounded-2xl ${tone}`}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <h3 className="mt-4 font-black">{title}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
                      {text}
                    </p>
                  </div>
                ))}
              </div>

              <div className="mt-5 flex gap-3 rounded-2xl border border-amber-500/15 bg-amber-500/10 p-5">
                <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                <p className="text-sm leading-6 text-slate-700 dark:text-slate-300">
                  The service is provided on an “as is” basis. We may modify,
                  update, replace, or discontinue features as the platform
                  evolves.
                </p>
              </div>
            </section>

            <hr className="border-slate-200/50 dark:border-white/5" />

            {/* 03 */}
            <section id="user-responsibilities" className="scroll-mt-40">
              <SectionTitle
                number="03"
                title="User Responsibilities"
                subtitle="Every user plays a role in keeping accounts, data, and platform activity safe and lawful."
              />

              <div className="grid gap-4 sm:grid-cols-2">
                {responsibilities.map(({ icon: Icon, title, text }) => (
                  <div
                    key={title}
                    className="flex gap-4 rounded-[24px] border border-slate-200/70 bg-white/60 p-5 dark:border-white/10 dark:bg-white/[0.03]"
                  >
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-600">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="font-black">{title}</h3>
                      <p className="mt-1.5 text-sm leading-6 text-slate-500 dark:text-slate-400">
                        {text}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <hr className="border-slate-200/50 dark:border-white/5" />

            {/* 04 */}
            <section id="data-privacy" className="scroll-mt-40">
              <SectionTitle
                number="04"
                title="Data Privacy"
                subtitle="Your use of NeoApp is also governed by our Privacy Policy."
              />

              <div className="grid gap-5 md:grid-cols-2">
                <div className="rounded-[26px] bg-emerald-500/10 p-6 ring-1 ring-emerald-500/15">
                  <ShieldCheck className="h-7 w-7 text-emerald-600" />
                  <h3 className="mt-4 text-lg font-black">
                    Your business data
                  </h3>
                  <p className="mt-2 text-sm leading-7 text-slate-600 dark:text-slate-300">
                    You retain ownership of data you enter into the CRM,
                    subject to applicable law and the rights of other people
                    whose information may be included.
                  </p>
                </div>

                <div className="rounded-[26px] bg-blue-500/10 p-6 ring-1 ring-blue-500/15">
                  <LockKeyhole className="h-7 w-7 text-blue-600" />
                  <h3 className="mt-4 text-lg font-black">
                    Privacy commitments
                  </h3>
                  <p className="mt-2 text-sm leading-7 text-slate-600 dark:text-slate-300">
                    We handle information according to our Privacy Policy and
                    do not sell personal data to third parties.
                  </p>
                </div>
              </div>

              <a
                href="/privacy"
                className="mt-5 inline-flex items-center gap-2 text-sm font-black text-blue-600 hover:underline dark:text-blue-400"
              >
                Read Privacy Policy <ChevronRight className="h-4 w-4" />
              </a>
            </section>

            <hr className="border-slate-200/50 dark:border-white/5" />

            {/* 05 */}
            <section id="limitations" className="scroll-mt-40">
              <SectionTitle
                number="05"
                title="Limitation of Liability"
                subtitle="Important information about risk and the limits of responsibility when using the platform."
              />

              <div className="overflow-hidden rounded-[28px] border border-amber-500/15 bg-gradient-to-br from-amber-50 to-white dark:from-amber-500/10 dark:to-white/[0.02]">
                <div className="grid items-center gap-6 p-6 md:grid-cols-[auto_1fr] md:p-8">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500 text-white shadow-lg shadow-amber-500/20">
                    <Scale className="h-7 w-7" />
                  </div>

                  <div>
                    <h3 className="text-xl font-black">
                      Understand the service limits
                    </h3>
                    <p className="mt-2 text-sm leading-7 text-slate-600 dark:text-slate-300">
                      Neophron Technologies shall not be liable for indirect,
                      incidental, special, or consequential damages resulting
                      from use of or inability to use the platform, including
                      data loss or business interruption, subject to applicable
                      law.
                    </p>
                  </div>
                </div>
              </div>
            </section>

            <hr className="border-slate-200/50 dark:border-white/5" />

            {/* 06 */}
            <section id="app-store" className="scroll-mt-40">
              <SectionTitle
                number="06"
                title="Apple App Store Terms"
                subtitle="These additional terms apply to users accessing NeoApp via the iOS App Store."
              />

              <div className="grid gap-5 md:grid-cols-2">
                <div className="rounded-[26px] border border-slate-200/70 bg-white/60 p-6 dark:border-white/10 dark:bg-white/[0.03]">
                  <Smartphone className="h-7 w-7 text-blue-600" />
                  <h3 className="mt-4 text-lg font-black">Acknowledgement</h3>
                  <p className="mt-2 text-sm leading-7 text-slate-600 dark:text-slate-300">
                    You acknowledge that these Terms are concluded between you and Neophron Technologies, and not with Apple Inc. Apple is not responsible for the App or its content.
                  </p>
                </div>

                <div className="rounded-[26px] border border-slate-200/70 bg-white/60 p-6 dark:border-white/10 dark:bg-white/[0.03]">
                  <ShieldCheck className="h-7 w-7 text-violet-600" />
                  <h3 className="mt-4 text-lg font-black">Third-Party Beneficiary</h3>
                  <p className="mt-2 text-sm leading-7 text-slate-600 dark:text-slate-300">
                    Apple and its subsidiaries are third-party beneficiaries of these Terms, and upon your acceptance, Apple will have the right to enforce these Terms against you.
                  </p>
                </div>
              </div>

              <div className="mt-5 space-y-3">
                {[
                  { title: "Maintenance & Support", text: "Neophron Technologies is solely responsible for providing any maintenance and support services with respect to the App. Apple has no obligation whatsoever to furnish any maintenance and support services." },
                  { title: "Warranty & Claims", text: "Apple is not responsible for any product warranties, whether express or implied by law. Apple is not responsible for addressing any claims by you or any third party relating to the App, including product liability claims, failure to conform to legal requirements, or consumer protection claims." },
                  { title: "Intellectual Property", text: "In the event of any third party claim that the App or your possession and use of the App infringes that third party's intellectual property rights, Neophron Technologies, not Apple, will be solely responsible for the investigation, defense, settlement and discharge of any such claim." },
                  { title: "Legal Compliance", text: "You represent and warrant that (i) you are not located in a country that is subject to a U.S. Government embargo, or that has been designated by the U.S. Government as a “terrorist supporting” country; and (ii) you are not listed on any U.S. Government list of prohibited or restricted parties." },
                ].map(({ title, text }) => (
                  <div key={title} className="flex flex-col gap-2 rounded-2xl border border-slate-200/70 bg-white/60 p-4 dark:border-white/10 dark:bg-white/[0.03]">
                    <h4 className="text-sm font-bold">{title}</h4>
                    <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">{text}</p>
                  </div>
                ))}
              </div>
            </section>

            <hr className="border-slate-200/50 dark:border-white/5" />

            {/* 07 */}
            <section id="termination" className="scroll-mt-40">
              <SectionTitle
                number="07"
                title="Termination"
                subtitle="Accounts may be suspended or terminated when platform terms are violated."
              />

              <div className="grid gap-5 md:grid-cols-2">
                <div className="rounded-[26px] border border-rose-500/15 bg-rose-500/10 p-6">
                  <XCircle className="h-7 w-7 text-rose-600" />
                  <h3 className="mt-4 text-lg font-black">
                    Suspension or termination
                  </h3>
                  <p className="mt-2 text-sm leading-7 text-slate-600 dark:text-slate-300">
                    We may suspend or terminate access if these terms are
                    violated, subject to applicable requirements and the
                    circumstances of the account.
                  </p>
                </div>

                <div className="rounded-[26px] border border-blue-500/15 bg-blue-500/10 p-6">
                  <UserCheck className="h-7 w-7 text-blue-600" />
                  <h3 className="mt-4 text-lg font-black">
                    User-requested closure
                  </h3>
                  <p className="mt-2 text-sm leading-7 text-slate-600 dark:text-slate-300">
                    You may request account termination through support and
                    follow the applicable account deletion procedure.
                  </p>
                </div>
              </div>

              <a
                href="/deleteaccount"
                className="mt-5 inline-flex items-center gap-2 rounded-full bg-slate-950 px-5 py-3 text-sm font-black text-white transition hover:-translate-y-0.5 dark:bg-white dark:text-slate-950"
              >
                View deletion process <ArrowRight className="h-4 w-4" />
              </a>
            </section>

            <hr className="border-slate-200/50 dark:border-white/5" />

            {/* 08 */}
            <section id="contact" className="scroll-mt-40">
              <SectionTitle
                number="08"
                title="Contact Us"
                subtitle="Questions about these terms? Contact the NeoApp support team."
              />

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-[24px] bg-slate-50 p-5 dark:bg-white/5">
                  <Building2 className="h-6 w-6 text-blue-600" />
                  <h3 className="mt-4 font-black">
                    Neophron Technologies
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
                    Platform and business support
                  </p>
                </div>

                <div className="rounded-[24px] bg-slate-50 p-5 dark:bg-white/5">
                  <MessageSquare className="h-6 w-6 text-violet-600" />
                  <h3 className="mt-4 font-black">Digital Contact</h3>
                  <div className="mt-2 space-y-2 text-sm">
                    <a
                      href="mailto:info@neophrontech.com"
                      className="block font-bold text-blue-600 hover:underline dark:text-blue-400"
                    >
                      info@neophrontech.com
                    </a>
                    <a
                      href="https://www.neophrontech.com/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block font-bold text-blue-600 hover:underline dark:text-blue-400"
                    >
                      www.neophrontech.com
                    </a>
                  </div>
                </div>
              </div>
            </section>
          </GlassCard>

          <div className="flex flex-col gap-2 rounded-[28px] border border-white/80 bg-white/75 mt-4 px-6 py-5 text-xs font-medium text-slate-500 backdrop-blur-2xl dark:border-white/10 dark:bg-[#0b0f19]/75 sm:flex-row sm:items-center sm:justify-between sm:px-9">
            <span>Last updated: March 21, 2026</span>
            <span className="inline-flex items-center gap-1.5">
              <Gavel className="h-4 w-4" />
              NeoApp Terms of Service
            </span>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}