export default function Dashboard() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-white to-indigo-50">
      <main className="mx-auto max-w-4xl px-6 py-12">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Dashboard</h1>
        <div className="flex gap-4">
          <a
            href="/link-email"
            className="rounded-lg bg-indigo-600 px-5 py-3 text-white font-semibold"
          >
            Link email
          </a>
          <a
            href="/example-app"
            className="rounded-lg bg-emerald-600 px-5 py-3 text-white font-semibold"
          >
            Example app
          </a>
          <a
            href="http://localhost:5173/"
            className="rounded-lg bg-gray-300 px-5 py-3 text-gray-700 font-semibold"
          >
            Forget PIN
          </a>
        </div>
      </main>
    </div>
  );
}
