import { Link } from 'react-router-dom';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Shield, FileText, Gamepad2 } from 'lucide-react';

export default function Privacy() {
  return (
    <MainLayout>
      <div className="max-w-4xl mx-auto py-6 lg:py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-8">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-success/30 to-success/10 flex items-center justify-center border border-success/20">
              <Shield className="w-6 h-6 text-success" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Privacy Policy</h1>
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
              <Link to="/terms">
                <FileText className="w-4 h-4 mr-1" />
                Terms
              </Link>
            </Button>
          </div>
        </div>

        {/* Content Card */}
        <Card className="p-6 lg:p-8">
          <div className="prose prose-invert max-w-none prose-headings:text-amber-400 prose-headings:font-bold prose-h2:text-2xl prose-h2:lg:text-3xl prose-h2:mt-12 prose-h2:mb-6 prose-h2:pb-3 prose-h2:border-b prose-h2:border-amber-400/30 prose-h3:text-xl prose-h3:font-semibold prose-h3:mt-8 prose-h3:mb-4 prose-li:text-muted-foreground prose-p:text-muted-foreground">

            <p className="text-muted-foreground">
              This Privacy Policy explains how OleBoy Token collects, uses, shares, and protects your personal data when you use our website and services. By using oleboytoken.com (the "Platform"), you acknowledge that you have read and understood this Privacy Policy. If you do not agree, please stop using the Platform.
            </p>

            <h2>1. About Us (Data Controller)</h2>
            <p>
              OleBoy Token ("we") is operated by Marco Palumbo, based in Verona, Italy. We act as the "data controller" for the personal data processed in connection with the Platform.
            </p>
            <p>
              Website: oleboytoken.com<br />
              Contact email: <a href="mailto:oleboytoken@yahoo.com" className="text-success hover:underline">oleboytoken@yahoo.com</a>
            </p>

            <h2>2. Scope</h2>
            <p>This Privacy Policy applies to:</p>
            <ul className="space-y-2">
              <li>visitors to oleboytoken.com;</li>
              <li>registered users who create an account;</li>
              <li>users who interact with matches, wallet functions, payments, withdrawals, and support.</li>
            </ul>

            <h2>3. Personal Data We Collect</h2>
            <p>We collect personal data in the following ways:</p>

            <h3>3.1. Data you provide to us</h3>
            <ul className="space-y-2">
              <li><strong>Account data:</strong> email address, username, password (stored in encrypted/hashed form where applicable).</li>
              <li><strong>Profile settings:</strong> region/platform preferences, linked gaming identifiers (e.g., Epic Games username) when you enter them.</li>
              <li><strong>Support communications:</strong> messages you send to us via email or other support channels, including attachments you provide as evidence in disputes.</li>
              <li><strong>Payment/withdrawal information:</strong> PayPal address for withdrawals and payment-related identifiers needed for processing (note: we do not store full card details).</li>
            </ul>

            <h3>3.2. Data collected automatically</h3>
            <p>When you use the Platform, we may automatically collect:</p>
            <ul className="space-y-2">
              <li>device and log data: IP address, browser type/version, device type, operating system, referral URL, timestamps, pages viewed, and error logs;</li>
              <li>approximate location derived from IP (country/region level);</li>
              <li>cookies and similar technologies (see Section 8).</li>
            </ul>

            <h3>3.3. Transaction and activity data</h3>
            <ul className="space-y-2">
              <li>match participation history, entry fees, results, wallet movements;</li>
              <li>deposits and withdrawal requests, status, and relevant timestamps;</li>
              <li>anti-fraud signals (e.g., unusual login patterns, suspicious activity flags).</li>
            </ul>

            <h3>3.4. Data from third parties</h3>
            <ul className="space-y-2">
              <li>Payment processors (e.g., Stripe) may provide us with confirmation of successful/failed payments and limited transaction metadata.</li>
              <li>PayPal may provide data necessary to confirm withdrawal processing status.</li>
            </ul>
            <p>We do not receive your full payment card details from Stripe.</p>

            <h2>4. Why We Use Your Data (Purposes)</h2>
            <p>We use your personal data to:</p>
            <ul className="space-y-2">
              <li><strong>Provide the service:</strong> create and manage your account, enable matches, manage wallet balances, process deposits and withdrawals.</li>
              <li><strong>Match integrity and fraud prevention:</strong> detect cheating, suspicious activity, multi-accounting, chargebacks, and to resolve disputes.</li>
              <li><strong>Support and communications:</strong> respond to your requests and provide assistance.</li>
              <li><strong>Platform improvement:</strong> debug issues, monitor performance, and improve user experience.</li>
              <li><strong>Legal compliance:</strong> comply with legal obligations, respond to lawful requests, and enforce our Terms of Service.</li>
            </ul>

            <h2>5. Legal Bases for Processing (GDPR)</h2>
            <p>We process personal data under one or more of these legal bases:</p>
            <ul className="space-y-2">
              <li><strong>Contract:</strong> processing necessary to provide the Platform services you request.</li>
              <li><strong>Legitimate interests:</strong> maintaining security, preventing fraud, improving the Platform, and enforcing rules (balanced against your rights).</li>
              <li><strong>Legal obligation:</strong> complying with applicable laws (e.g., accounting, anti-fraud measures).</li>
              <li><strong>Consent:</strong> where required for certain cookies or optional communications (you can withdraw consent at any time).</li>
            </ul>

            <h2>6. Sharing Your Data</h2>
            <p>We do not sell your personal data. We may share it only when necessary:</p>
            <ul className="space-y-2">
              <li><strong>Service providers:</strong> hosting providers, analytics/monitoring tools, email/support tools, and other vendors helping operate the Platform.</li>
              <li><strong>Payment providers:</strong> Stripe (deposits) and PayPal (withdrawals), only to process payments/withdrawals and prevent fraud.</li>
              <li><strong>Legal and regulatory authorities:</strong> if required by law, court order, or to protect our rights and users.</li>
              <li><strong>Professional advisors:</strong> legal, accounting, or security advisors if needed.</li>
              <li><strong>Business transfer:</strong> if the Platform is sold or transferred, data may be transferred as part of that transaction, subject to law.</li>
            </ul>

            <h2>7. International Data Transfers</h2>
            <p>
              Your data may be processed outside Italy/EEA depending on where our service providers are located. When this happens, we use appropriate safeguards required by GDPR (such as Standard Contractual Clauses) to protect your data.
            </p>

            <h2>8. Cookies and Tracking Technologies</h2>
            <p>We use cookies and similar technologies to:</p>
            <ul className="space-y-2">
              <li>keep you logged in and maintain session security;</li>
              <li>remember preferences;</li>
              <li>analyze traffic and improve performance.</li>
            </ul>
            <p>You can manage cookies through your browser settings. Some cookies are essential for the Platform to work; disabling them may limit functionality.</p>

            <h2>9. Data Retention</h2>
            <p>We retain personal data only as long as necessary for the purposes above:</p>
            <ul className="space-y-2">
              <li><strong>Account data:</strong> kept while your account is active; if you request deletion, we will delete or anonymize where possible, unless we must keep certain data for legal reasons.</li>
              <li><strong>Transaction and financial records:</strong> retained as required by law and for legitimate accounting/anti-fraud needs.</li>
              <li><strong>Support and dispute records:</strong> retained for a reasonable period to handle claims and enforce rules.</li>
              <li><strong>Logs and security data:</strong> retained for a limited period to protect the Platform and investigate incidents.</li>
            </ul>

            <h2>10. Your Rights (GDPR)</h2>
            <p>If you are in the EEA/UK (and in many other jurisdictions with similar laws), you may have the right to:</p>
            <ul className="space-y-2">
              <li><strong>Access:</strong> request a copy of your personal data.</li>
              <li><strong>Rectification:</strong> correct inaccurate or incomplete data.</li>
              <li><strong>Erasure:</strong> request deletion ("right to be forgotten"), subject to legal exceptions.</li>
              <li><strong>Restriction:</strong> limit how we process your data in certain cases.</li>
              <li><strong>Data portability:</strong> receive certain data in a structured, machine-readable format.</li>
              <li><strong>Objection:</strong> object to processing based on legitimate interests and to direct marketing.</li>
              <li><strong>Withdraw consent:</strong> when processing is based on consent.</li>
            </ul>
            <p>
              To exercise rights, contact: <a href="mailto:oleboytoken@yahoo.com" className="text-success hover:underline">oleboytoken@yahoo.com</a>
            </p>

            <h2>11. Security</h2>
            <p>We implement technical and organizational measures to protect your data, such as:</p>
            <ul className="space-y-2">
              <li>access controls and least-privilege principles;</li>
              <li>encrypted connections (HTTPS);</li>
              <li>monitoring and logging for suspicious activity;</li>
              <li>secure storage practices.</li>
            </ul>
            <p>No system is 100% secure, but we work to protect your data and improve security continuously.</p>

            <h2>12. Children</h2>
            <p>
              The Platform is strictly for users aged 18+. We do not knowingly collect personal data from anyone under 18. If you believe a minor has provided data, contact us and we will take appropriate steps to delete it.
            </p>

            <h2>13. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. We will post the updated version on oleboytoken.com and update the "Last updated" date. If changes are significant, we may provide additional notice on the Platform.
            </p>

            <h2>14. Contact</h2>
            <p>
              For questions, requests, or complaints related to privacy:<br />
              <a href="mailto:oleboytoken@yahoo.com" className="text-success hover:underline">oleboytoken@yahoo.com</a><br />
              Data Controller: Marco Palumbo (Verona, Italy)
            </p>

          </div>
        </Card>
      </div>
    </MainLayout>
  );
}
