import { Header } from "@kombuse/ui/components";

export default function Home() {
  return (
    <div className="min-h-screen">
      <Header />
      <main className="flex flex-col items-center justify-center p-8">
        <h1 className="text-4xl font-bold">Welcome</h1>
      </main>
    </div>
  );
}
