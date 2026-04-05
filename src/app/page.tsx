import Link from 'next/link';

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 h-14 flex justify-between items-center">
          <span className="font-semibold text-lg">Writing Feedback</span>
          <div className="flex gap-3">
            <Link
              href="/login"
              className="text-sm text-gray-600 hover:text-gray-900 px-3 py-1.5"
            >
              Log In
            </Link>
            <Link
              href="/signup"
              className="text-sm bg-blue-600 text-white px-4 py-1.5 rounded-lg hover:bg-blue-700"
            >
              Sign Up
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4">
        <div className="max-w-2xl text-center">
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
            Chinese Writing AI Feedback
          </h1>
          <p className="text-lg text-gray-600 mb-8 leading-relaxed">
            Submit your Chinese composition and get instant AI feedback.
            <br className="hidden sm:block" />
            Upload a photo of handwritten work, review OCR results, and receive structured corrections.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/signup"
              className="bg-blue-600 text-white px-8 py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors"
            >
              Get Started
            </Link>
            <Link
              href="/login"
              className="border border-gray-300 text-gray-700 px-8 py-3 rounded-lg font-medium hover:bg-gray-50 transition-colors"
            >
              I Have an Account
            </Link>
          </div>

          <div className="mt-16 grid grid-cols-1 sm:grid-cols-3 gap-6 text-left">
            <div className="bg-white p-5 rounded-xl border border-gray-200">
              <h3 className="font-semibold mb-2">Photo Upload</h3>
              <p className="text-sm text-gray-600">
                Take a photo of your handwritten composition and let OCR extract the Chinese text
              </p>
            </div>
            <div className="bg-white p-5 rounded-xl border border-gray-200">
              <h3 className="font-semibold mb-2">Instant Feedback</h3>
              <p className="text-sm text-gray-600">
                AI analyzes your writing and provides sentence-level corrections with explanations
              </p>
            </div>
            <div className="bg-white p-5 rounded-xl border border-gray-200">
              <h3 className="font-semibold mb-2">Error Tracking</h3>
              <p className="text-sm text-gray-600">
                Track your error patterns over time to identify and improve weak areas
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
