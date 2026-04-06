import Link from 'next/link';

export default function PrivacyPolicy() {
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
        <h1 className="text-2xl font-bold mb-6">Privacy Policy</h1>
        <p className="text-xs text-gray-400 mb-8">Last updated: April 2026</p>

        <div className="prose prose-sm prose-gray max-w-none space-y-6 text-gray-700 text-sm leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">1. Introduction</h2>
            <p>
              XIE Chinese Writing Lab (&quot;XIE,&quot; &quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) operates the website at xielabai.com (the &quot;Service&quot;).
              This Privacy Policy explains how we collect, use, and protect your personal information when you use our Service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">2. Information We Collect</h2>
            <p><strong>Account Information:</strong> When you create an account, we collect your email address, name, and role (teacher or student).</p>
            <p><strong>Guest Users:</strong> If you use the Service as a guest, we create an anonymous session. No personal information is collected unless you later register.</p>
            <p><strong>Composition Data:</strong> We store the Chinese writing compositions you submit, including any uploaded images. These are used solely to provide AI feedback.</p>
            <p><strong>AI Feedback Data:</strong> We store the AI-generated feedback, error analysis, and correction history associated with your submissions.</p>
            <p><strong>Usage Data:</strong> We may collect basic usage information such as browser type, device type, and access times for the purpose of improving the Service.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">3. How We Use Your Information</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>To provide and maintain the Service, including AI-powered writing feedback</li>
              <li>To track your writing progress and error patterns over time</li>
              <li>To enable teachers to view and review student submissions within their classes</li>
              <li>To improve the quality and accuracy of our AI feedback</li>
              <li>To communicate with you about the Service</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">4. Third-Party Services</h2>
            <p>We use the following third-party services to operate:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Supabase:</strong> Database and authentication (data stored securely in the cloud)</li>
              <li><strong>OpenAI:</strong> AI feedback generation. Your composition text is sent to OpenAI&apos;s API for analysis. OpenAI&apos;s data usage policies apply.</li>
              <li><strong>OCR.space:</strong> Optical character recognition for uploaded images. Uploaded images are processed through their API.</li>
              <li><strong>Vercel:</strong> Website hosting</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">5. Data Sharing</h2>
            <p>
              We do not sell, trade, or rent your personal information to third parties.
              Your composition data is only shared with the third-party services listed above for the sole purpose of providing the Service.
              Teachers can only view submissions from students who have joined their class.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">6. Data Retention</h2>
            <p>
              Your data is retained as long as your account is active. You may request deletion of your account and associated data by contacting us.
              Guest session data may be periodically cleaned up.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">7. Data Security</h2>
            <p>
              We implement appropriate technical measures to protect your data, including encrypted connections (HTTPS), secure authentication, and row-level security policies in our database.
              However, no method of internet transmission is 100% secure.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">8. Children&apos;s Privacy</h2>
            <p>
              Our Service is designed for college-level students and above. We do not knowingly collect information from children under the age of 13.
              If you believe a child under 13 has provided us with personal information, please contact us.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">9. Your Rights</h2>
            <p>You have the right to:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Access your personal data</li>
              <li>Request correction of inaccurate data</li>
              <li>Request deletion of your data</li>
              <li>Withdraw consent at any time by deleting your account</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">10. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. Changes will be posted on this page with an updated date.
              Continued use of the Service after changes constitutes acceptance of the new policy.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">11. Contact Us</h2>
            <p>
              If you have questions about this Privacy Policy, please contact us at: <strong>binyanglc@gmail.com</strong>
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
