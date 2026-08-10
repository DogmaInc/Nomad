import MapShell from '@/components/map/MapShell';

export default function Home() {
  return (
    <main className="flex h-dvh w-full flex-col">
      <header className="border-b border-neutral-800 px-4 py-3">
        <h1 className="text-lg font-semibold">Nomad</h1>
        <p className="text-sm text-neutral-400">
          M0 scaffold — empty map shell. No facility data seeded yet.
        </p>
      </header>
      <div className="min-h-0 flex-1">
        <MapShell />
      </div>
    </main>
  );
}
