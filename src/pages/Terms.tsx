import { Link } from 'react-router-dom';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileText, Shield, Gamepad2 } from 'lucide-react';

export default function Terms() {
  return (
    <MainLayout>
      <div className="max-w-4xl mx-auto py-6 lg:py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-8">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center border border-primary/20">
              <FileText className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Terms of Service</h1>
              <p className="text-sm text-muted-foreground">Last updated: 24/01/2026</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to="/rules">
                <Gamepad2 className="w-4 h-4 mr-1" />
                Rules
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link to="/privacy">
                <Shield className="w-4 h-4 mr-1" />
                Privacy
              </Link>
            </Button>
          </div>
        </div>

        {/* Content Card */}
        <Card className="p-6 lg:p-8">
          <div className="prose prose-invert max-w-none prose-headings:text-amber-400 prose-headings:font-bold prose-h2:text-2xl prose-h2:lg:text-3xl prose-h2:mt-12 prose-h2:mb-6 prose-h2:pb-3 prose-h2:border-b prose-h2:border-amber-400/30 prose-h3:text-xl prose-h3:font-semibold prose-h3:mt-8 prose-h3:mb-4 prose-li:text-muted-foreground prose-p:text-muted-foreground">

            <h2>1. Who We Are</h2>
            <p>
              OleBoy Token ("we", "OleBoy Token", "Platform") is a service operated by Marco Palumbo, based in Verona, Italy.
            </p>
            <p>
              Website: oleboytoken.com<br />
              Contact email: <a href="mailto:oleboytoken@yahoo.com" className="text-primary hover:underline">oleboytoken@yahoo.com</a>
            </p>

            <h2>2. Acceptance of These Terms</h2>
            <p>
              By accessing or using oleboytoken.com, creating an account, or participating in any match, you agree to these Terms of Service ("Terms"). If you do not agree, you must not use the Platform.
            </p>

            <h2>3. Eligibility (18+)</h2>
            <ul className="space-y-2">
              <li>You must be at least 18 years old to register and use the Platform.</li>
              <li>You must comply with the laws of your country/region. If competitive platforms with cash prizes are restricted or illegal where you live, you may not use OleBoy Token.</li>
              <li>You may use the Platform only for lawful purposes and in accordance with these Terms.</li>
            </ul>

            <h2>4. Accounts and Registration</h2>
            <ul className="space-y-2">
              <li>You must create an account to access the Platform.</li>
              <li>Only one account per person is allowed. Multi-accounting, shared accounts, or fake information are prohibited.</li>
              <li>You are responsible for keeping your login credentials secure. All activity on your account is considered your responsibility.</li>
              <li>We may suspend, restrict, or terminate accounts at our discretion in cases of violations, fraud, suspicious activity, or legal requirements.</li>
            </ul>

            <h2>5. Platform Description</h2>
            <ul className="space-y-2">
              <li>OleBoy Token allows users to create and participate in competitive matches with an entry fee and a withdrawable cash prize.</li>
              <li>We do not guarantee uninterrupted availability of the Platform. Maintenance, updates, and temporary downtime may occur.</li>
            </ul>

            <h2>6. Wallet, Coins and XP</h2>
            <ul className="space-y-2">
              <li>"Coins" (or wallet balance) represent the amount available on your account to pay match entry fees and receive winnings.</li>
              <li>"XP" are experience points separate from Coins. XP are not money, are not withdrawable, and are only used for internal Platform features (e.g., unlocks/rewards, if enabled).</li>
              <li>Coins and XP are non-transferable between users unless an official Platform feature explicitly allows it.</li>
            </ul>

            <h2>7. Deposits and Payments</h2>
            <ul className="space-y-2">
              <li>Deposits and payments may be processed through Stripe (and/or other integrated payment methods).</li>
              <li>We may apply anti-fraud checks or request additional verification before crediting a deposit or enabling certain actions.</li>
              <li>Payment providers may refuse or fail transactions for technical or security reasons; we are not responsible for provider decisions.</li>
            </ul>

            <h2>8. Platform Fee and Prizes</h2>
            <ul className="space-y-2">
              <li>Match fee: we retain a 5% fee on the total match amount.</li>
              <li>Winnings: the winner receives 95% of the total match amount as the prize (credited to the wallet).</li>
              <li>If a match is canceled due to technical issues or rule violations, we may refund the entry fee to the wallet and/or manage the match according to the integrity rules in Section 11.</li>
            </ul>

            <h2>9. Withdrawals (Stripe Connect)</h2>
            <ul className="space-y-2">
              <li>Withdrawals are processed via Stripe Connect directly to your bank account.</li>
              <li>Minimum withdrawal: €10. Withdrawal fee: €0.50 per transaction.</li>
              <li>Processing time: withdrawals are normally processed within 1-3 business days. Delays may occur due to anti-fraud checks, verification requirements, Stripe/bank issues, holidays, or technical problems.</li>
              <li>Verification: to protect users and the Platform, Stripe may require identity verification (KYC) before enabling payouts, including:
                <ul className="mt-2 space-y-1">
                  <li>confirming identity via government-issued ID;</li>
                  <li>verifying bank account ownership;</li>
                  <li>additional checks for higher amounts or suspicious activity.</li>
                </ul>
              </li>
              <li>We may block, delay, or deny withdrawals if we detect suspicious activity, Terms violations, or non-cooperation with verification.</li>
            </ul>

            <h2>10. No Refunds</h2>
            <ul className="space-y-2">
              <li>Except where required by applicable law, we do not offer refunds for deposits, match entry fees, Coins, or other digital credits once credited or used on the Platform.</li>
              <li>If a payment is reversed (chargeback) or disputed with a payment provider, we may suspend the account, freeze balances, and require resolution before restoring access or processing withdrawals.</li>
            </ul>

            <h2>11. Match Integrity, Results, and Disputes</h2>
            <ul className="space-y-2">
              <li>Any activity that compromises match fairness is prohibited, including cheating, exploits, boosting, collusion, match-fixing, account sharing, or result manipulation.</li>
              <li>We may adjust, invalidate, or cancel match results if:
                <ul className="mt-2 space-y-1">
                  <li>the match was not played according to fair play rules,</li>
                  <li>evidence of cheating or suspicious activity emerges,</li>
                  <li>technical errors or manipulation are detected.</li>
                </ul>
              </li>
              <li>Disputes: users may submit a dispute within a reasonable timeframe after the match ends (standard: within 24 hours), and may be asked to provide evidence (screenshots/clips/replays).</li>
              <li>Final decision: decisions on match validity and dispute outcomes are made at OleBoy Token's discretion to protect the integrity of the service.</li>
            </ul>

            <h2>12. Prohibited Conduct</h2>
            <p>You must not:</p>
            <ul className="space-y-2">
              <li>engage in unlawful, fraudulent, or harmful activities;</li>
              <li>provide false information or impersonate others;</li>
              <li>create multiple accounts or use someone else's account;</li>
              <li>buy/sell/trade Coins, balances, or advantages outside the Platform;</li>
              <li>attempt to attack or exploit the Platform (DDoS, hacking, reverse engineering, malicious automation);</li>
              <li>harass, threaten, or use hateful or abusive language in any communication features that may exist.</li>
            </ul>
            <p>Violations may result in suspension, termination, and restriction of withdrawals pending verification.</p>

            <h2>13. Suspension and Termination</h2>
            <p>We may suspend or terminate your account without notice if:</p>
            <ul className="space-y-2">
              <li>you violate these Terms or integrity rules,</li>
              <li>we detect fraud, chargebacks, or multi-accounting,</li>
              <li>we receive requests from authorities or payment providers.</li>
            </ul>
            <p>In cases of serious violations, funds may be frozen for the time necessary to investigate and/or comply with legal or provider requirements.</p>

            <h2>14. Disclaimer and Limitation of Liability</h2>
            <ul className="space-y-2">
              <li>The Platform is provided "as is" and "as available." We do not guarantee it will be error-free or uninterrupted.</li>
              <li>To the maximum extent permitted by law, we are not liable for:
                <ul className="mt-2 space-y-1">
                  <li>indirect damages, loss of profits, loss of data,</li>
                  <li>downtime or issues caused by Stripe, PayPal, or other third parties,</li>
                  <li>actions or misconduct of other users.</li>
                </ul>
              </li>
              <li>Where appropriate, and subject to law, your potential remedy for significant service issues may be wallet credits or match cancellation.</li>
            </ul>

            <h2>15. Intellectual Property</h2>
            <p>
              The website, design, "OleBoy Token" branding, and Platform content are owned by us or used under license. Unauthorized copying or use is prohibited.
            </p>

            <h2>16. Privacy</h2>
            <p>
              Personal data is handled as described in our <Link to="/privacy" className="text-primary hover:underline">Privacy Policy</Link>. By using the Platform, you also agree to the Privacy Policy.
            </p>

            <h2>17. Changes to These Terms</h2>
            <p>
              We may update these Terms at any time. The latest version will be posted on oleboytoken.com with an updated "Last updated" date. Continued use after changes means you accept the updated Terms.
            </p>

            <h2>18. Governing Law and Jurisdiction</h2>
            <p>
              These Terms are governed by Italian law. The competent court is Verona, Italy, except where mandatory consumer protection laws provide otherwise.
            </p>

            <h2>19. Contact</h2>
            <p>
              If you have questions about these Terms, contact <a href="mailto:oleboytoken@yahoo.com" className="text-primary hover:underline">oleboytoken@yahoo.com</a>
            </p>

          </div>
        </Card>
      </div>
    </MainLayout>
  );
}
