import { Link } from 'next-view-transitions'
import { ArrowLeft } from 'lucide-react'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Terms of Use - Podium Arena',
  description: 'Terms of Use for Podium Arena skill gaming platform.',
}

export default function TermsPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Home
      </Link>

      <h1 className="text-3xl font-bold text-slate-900 dark:text-white font-title mb-2">Terms of Use</h1>
      <p className="text-sm text-slate-500 mb-8">Last updated: February 14, 2026</p>

      <div className="space-y-8 text-slate-700 dark:text-slate-300 text-[15px] leading-relaxed">
        <section>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-3">1. Acceptance of Terms</h2>
          <p>
            By accessing or using Podium Arena (&quot;the Platform&quot;), you agree to be bound by these Terms of Use. If you do not agree to these terms, do not use the Platform. Your continued use constitutes acceptance of any updates or modifications to these terms.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-3">2. Eligibility</h2>
          <p>
            You must be at least 18 years of age to use Podium Arena. By creating an account, you represent that you are 18 or older and that you are legally permitted to participate in skill-based competitions in your jurisdiction.
          </p>
          <p className="mt-2">
            Each person may maintain only one account. You are responsible for maintaining the confidentiality of your account credentials and for all activity that occurs under your account.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-3">3. Virtual Credits</h2>
          <p>
            Podium Arena uses a virtual credit system. Credits are digital tokens used exclusively within the Platform and have <strong>no guaranteed real-world monetary value</strong>. Credits are not redeemable for cash, cryptocurrency, or any other form of payment unless explicitly offered by the Platform.
          </p>
          <p className="mt-2">
            The Platform reserves the right to modify, adjust, or reset the credit system at any time, including but not limited to changing credit values, daily grants, entry costs, and distribution mechanics. Any credits in your account may be subject to adjustment without prior notice.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-3">4. Gameplay &amp; Fair Play</h2>
          <p>
            Podium Arena employs automated anti-cheat and integrity monitoring systems. These systems analyze gameplay data including timing patterns, interaction sequences, and statistical anomalies to detect unfair play.
          </p>
          <p className="mt-2">
            Turns flagged by the integrity system may be excluded from leaderboard rankings and prize settlements. The Platform&apos;s determination of fair play violations is final and not subject to appeal. There is no guarantee that any particular game turn will qualify for prize distribution.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-3">5. Account Conduct</h2>
          <p>You agree not to:</p>
          <ul className="list-disc list-inside mt-2 space-y-1.5 pl-2">
            <li>Use bots, scripts, browser automation, or any form of automated gameplay</li>
            <li>Exploit bugs, glitches, or unintended mechanics for unfair advantage</li>
            <li>Create or operate multiple accounts</li>
            <li>Manipulate game outcomes through collusion with other users</li>
            <li>Attempt to reverse-engineer, decompile, or tamper with Platform systems</li>
            <li>Abuse the referral system through fraudulent or deceptive means</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-3">6. Prizes &amp; Settlements</h2>
          <p>
            Prize pools are formed from credits spent by players on game turns. Pools are distributed according to the Platform&apos;s settlement rules, which include allocations for winners, participation rebates, and platform operations.
          </p>
          <p className="mt-2">
            <strong>There is no guarantee of winning.</strong> Spending credits to play a game does not entitle you to any return. The Platform reserves the right to modify pool distribution rules, settlement schedules, and prize structures at any time.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-3">7. Account Suspension &amp; Termination</h2>
          <p>
            The Platform may suspend or terminate your account at its sole discretion if it determines that you have violated these terms or engaged in activity that undermines the integrity of the Platform.
          </p>
          <p className="mt-2">
            Upon termination, any credits remaining in your account may be forfeited. The Platform is under no obligation to refund, compensate, or transfer credits from suspended or terminated accounts.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-3">8. Data Collection &amp; Privacy</h2>
          <p>
            To maintain platform integrity and enforce fair play, Podium Arena collects and processes gameplay data including but not limited to:
          </p>
          <ul className="list-disc list-inside mt-2 space-y-1.5 pl-2">
            <li>Gameplay timing and interaction patterns</li>
            <li>Device and browser information</li>
            <li>IP addresses and session data</li>
            <li>Statistical gameplay metrics used for anti-cheat analysis</li>
          </ul>
          <p className="mt-2">
            This data is used for integrity enforcement, fraud prevention, and platform improvement. By using the Platform, you consent to this data collection.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-3">9. Limitation of Liability</h2>
          <p>
            Podium Arena is provided &quot;as is&quot; without warranties of any kind, express or implied. The Platform assumes no liability for:
          </p>
          <ul className="list-disc list-inside mt-2 space-y-1.5 pl-2">
            <li>Loss of credits due to system errors, bugs, or downtime</li>
            <li>Changes to credit value, availability, or distribution rules</li>
            <li>Losses resulting from unauthorized access to your account</li>
            <li>Service interruptions, data loss, or platform unavailability</li>
            <li>Decisions made by automated integrity and anti-cheat systems</li>
          </ul>
          <p className="mt-2">
            In no event shall Podium Arena, its operators, or affiliates be liable for any indirect, incidental, special, or consequential damages arising from your use of the Platform.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-3">10. Modifications to Terms</h2>
          <p>
            The Platform reserves the right to update or modify these Terms of Use at any time. Changes will be reflected by the &quot;Last updated&quot; date at the top of this page. Your continued use of Podium Arena after changes are posted constitutes acceptance of the updated terms.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-3">11. Contact</h2>
          <p>
            If you have questions about these Terms of Use, please contact us at{' '}
            <a href="mailto:support@podiumarena.com" className="text-yellow-600 dark:text-yellow-400 hover:underline">
              support@podiumarena.com
            </a>.
          </p>
        </section>
      </div>
    </div>
  )
}
