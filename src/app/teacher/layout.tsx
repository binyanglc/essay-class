import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

export default function TeacherLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Navbar />
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-6">
        {children}
      </main>
      <Footer />
    </>
  );
}
