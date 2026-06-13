import { Link } from "wouter";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-foreground mb-4">404</h1>
        <p className="text-muted-foreground mb-8">This page doesn't exist.</p>
        <Link href="/">
          <button className="px-6 py-3 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors">
            Go home
          </button>
        </Link>
      </div>
    </div>
  );
}
