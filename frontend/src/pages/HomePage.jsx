const HomePage = () => (
  <main dir="rtl" className="flex min-h-screen items-center justify-center bg-[#f8fafc] px-4 py-10 text-right text-[#1a202c]">
    <section className="w-full max-w-xl rounded-lg border border-[#e2e8f0] bg-white p-8 shadow-sm">
      <h1 className="mb-3 text-2xl font-bold">التحقق من التصاريح</h1>
      <p className="mb-4 leading-7 text-gray-700">
        افتح رابط التحقق الذي استلمته لعرض حالة التصريح ومعلوماته الأساسية.
      </p>
      <p className="mb-6 leading-7 text-gray-700">
        لا تدخل كلمة مرور حسابك الحكومي أو بيانات تسجيل الدخول الشخصية في هذه الصفحة.
      </p>
      <a href="/login" className="font-semibold text-[#17745b] underline">
        دخول إدارة التصاريح
      </a>
    </section>
  </main>
);

export default HomePage;
