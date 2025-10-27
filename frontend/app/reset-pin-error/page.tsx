import Link from "next/link";

export default function ResetPinErrorPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-white to-indigo-50 px-4">
      <main className="mx-auto w-full max-w-lg text-center">
        <h1 className="mb-3 text-3xl font-bold text-gray-900">Access denied</h1>
        <p className="mb-6 text-gray-700">
          Only users who have verified their email can reset PIN.
        </p>
        <div className="flex justify-center">
          <Link
            href="/dashboard"
            className="rounded-lg bg-indigo-600 px-5 py-3 text-white font-semibold"
          >
            Back to dashboard
          </Link>
        </div>
      </main>
    </div>
  );
}
