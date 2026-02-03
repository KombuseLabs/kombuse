import { Link } from "react-router-dom";

export function Home() {
  return (
    <main className="flex flex-col items-center justify-center p-8 gap-8">
      <h1 className="text-4xl font-bold">Welcome</h1>
      <nav className="flex gap-4">
        <Link to="/chats" className="text-lg underline hover:no-underline">
          Chats
        </Link>
        <Link to="/tickets" className="text-lg underline hover:no-underline">
          Tickets
        </Link>
      </nav>
    </main>
  );
}
