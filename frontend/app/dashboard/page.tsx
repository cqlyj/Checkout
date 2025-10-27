export default function Dashboard() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-white to-indigo-50">
      <main className="mx-auto max-w-4xl px-6 py-12">
        <h1 className="mb-8 text-center text-3xl font-bold text-gray-900">
          Dashboard
        </h1>

        <div className="mx-auto grid max-w-3xl grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition hover:shadow-md">
            <div className="space-y-2">
              <h2 className="text-base font-semibold text-gray-900">
                Link email
              </h2>
              <p className="text-sm text-gray-500">
                Add an email for recovery and backup.
              </p>
              <a
                href="/link-email"
                className="inline-flex w-full items-center justify-center rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700"
              >
                Continue
              </a>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition hover:shadow-md">
            <div className="space-y-2">
              <h2 className="text-base font-semibold text-gray-900">
                Example app
              </h2>
              <p className="text-sm text-gray-500">
                Enjoy facial payments right now in a demo checkout.
              </p>
              <a
                href="/example-app"
                className="inline-flex w-full items-center justify-center rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700"
              >
                Open demo
              </a>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition hover:shadow-md">
            <div className="space-y-2">
              <h2 className="text-base font-semibold text-gray-900">
                Forget PIN
              </h2>
              <p className="text-sm text-gray-500">
                Reset your PIN by verifying your linked email.
              </p>
              <a
                href="http://localhost:5173/"
                className="inline-flex w-full items-center justify-center rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700"
              >
                Reset PIN
              </a>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
