import Link from 'next/link';

export default function TermsOfService() {
  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-gray-100">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center">
          <Link href="/" className="font-semibold text-lg">
            <span className="text-blue-600">XIE</span> Writing Lab
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-10">
        <h1 className="text-2xl font-bold mb-6">Terms of Service</h1>
        <p className="text-xs text-gray-400 mb-8">Last updated: April 2026</p>

        <div className="prose prose-sm prose-gray max-w-none space-y-6 text-gray-700 text-sm leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">1. Acceptance of Terms</h2>
            <p>
              By accessing or using XIE Chinese Writing Lab (&quot;the Service&quot;), you agree to be bound by these Terms of Service.
              If you do not agree to these terms, please do not use the Service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">2. Description of Service</h2>
            <p>
              XIE Chinese Writing Lab provides AI-powered feedback on Chinese language writing compositions.
              The Service includes text submission, image upload with OCR, AI analysis, error tracking, and classroom management features.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">3. User Accounts</h2>
            <p>
              You may use the Service as a guest or create a registered account.
              You are responsible for maintaining the confidentiality of your account credentials.
              Teachers are responsible for managing their classes and the invite codes they share.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">4. Acceptable Use</h2>
            <p>You agree not to:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Use the Service for any illegal purpose</li>
              <li>Submit content that is offensive, harmful, or violates the rights of others</li>
              <li>Attempt to interfere with the Service&apos;s operation or security</li>
              <li>Share your account credentials with others</li>
              <li>Use automated tools to scrape or access the Service</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">5. AI Feedback Disclaimer</h2>
            <p>
              The AI-generated feedback is provided for educational purposes and may not always be accurate.
              It should not be treated as a substitute for professional language instruction.
              Teachers may review and modify AI feedback as needed.
              We do not guarantee the accuracy, completeness, or reliability of AI-generated content.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">6. Intellectual Property</h2>
            <p>
              You retain ownership of the compositions you submit. By using the Service, you grant us a limited license
              to process your compositions through our AI system for the purpose of providing feedback.
              The Service itself, including its design, code, and AI systems, is owned by XIE Chinese Writing Lab.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">7. Limitation of Liability</h2>
            <p>
              The Service is provided &quot;as is&quot; without warranties of any kind, either express or implied.
              We shall not be liable for any indirect, incidental, or consequential damages arising from your use of the Service.
              Our total liability shall not exceed the amount you paid for the Service (if any).
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">8. Termination</h2>
            <p>
              We reserve the right to suspend or terminate your access to the Service at any time for violation of these terms.
              You may stop using the Service at any time.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">9. Changes to Terms</h2>
            <p>
              We may modify these Terms at any time. Changes will be posted on this page.
              Continued use of the Service after changes constitutes acceptance of the updated terms.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">10. Contact</h2>
            <p>
              For questions about these Terms, contact us at: <strong>binyanglc@gmail.com</strong>
            </p>
          </section>
        </div>

        <div className="mt-10 pt-6 border-t border-gray-100 text-xs text-gray-400">
          <Link href="/" className="hover:text-gray-600">&larr; Back to home</Link>
        </div>
      </main>
    </div>
  );
}
