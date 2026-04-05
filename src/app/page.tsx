import Link from 'next/link';

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 h-14 flex justify-between items-center">
          <span className="font-semibold text-lg">写作反馈平台</span>
          <div className="flex gap-3">
            <Link
              href="/login"
              className="text-sm text-gray-600 hover:text-gray-900 px-3 py-1.5"
            >
              登录
            </Link>
            <Link
              href="/signup"
              className="text-sm bg-blue-600 text-white px-4 py-1.5 rounded-lg hover:bg-blue-700"
            >
              注册
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4">
        <div className="max-w-2xl text-center">
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
            中文写作AI反馈系统
          </h1>
          <p className="text-lg text-gray-600 mb-8 leading-relaxed">
            提交中文作文，获得即时AI反馈。
            <br className="hidden sm:block" />
            支持手写拍照上传、OCR识别、结构化错误分析和长期错误追踪。
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/signup"
              className="bg-blue-600 text-white px-8 py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors"
            >
              开始使用
            </Link>
            <Link
              href="/login"
              className="border border-gray-300 text-gray-700 px-8 py-3 rounded-lg font-medium hover:bg-gray-50 transition-colors"
            >
              已有账号
            </Link>
          </div>

          <div className="mt-16 grid grid-cols-1 sm:grid-cols-3 gap-6 text-left">
            <div className="bg-white p-5 rounded-xl border border-gray-200">
              <h3 className="font-semibold mb-2">拍照上传</h3>
              <p className="text-sm text-gray-600">
                拍摄手写作文，自动OCR识别中文内容
              </p>
            </div>
            <div className="bg-white p-5 rounded-xl border border-gray-200">
              <h3 className="font-semibold mb-2">即时反馈</h3>
              <p className="text-sm text-gray-600">
                AI分析作文，提供句子级修改建议和结构化反馈
              </p>
            </div>
            <div className="bg-white p-5 rounded-xl border border-gray-200">
              <h3 className="font-semibold mb-2">错误追踪</h3>
              <p className="text-sm text-gray-600">
                长期记录错误模式，帮助教师和学生识别薄弱环节
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
