import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="border-t border-gray-100 py-4 px-4 mt-auto">
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-2 text-xs text-gray-400">
        <span>&copy; {new Date().getFullYear()} aiXIE Writing Lab</span>
        <div className="flex gap-4">
          <Link href="/privacy" className="hover:text-gray-600">Privacy</Link>
          <Link href="/terms" className="hover:text-gray-600">Terms</Link>
        </div>
      </div>
    </footer>
  );
}
