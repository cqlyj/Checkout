export default function ResetPinErrorPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-white to-indigo-50">
      <main className="mx-auto max-w-4xl px-6 py-12">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">Access denied</h1>
        <p className="text-gray-700">
          Only users who have verified their email can reset PIN.
        </p>
      </main>
    </div>
  );
}

