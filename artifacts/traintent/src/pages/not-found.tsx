import { Link } from "wouter";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="text-center">
        <h1 className="text-[34px] font-light leading-[1.08] tracking-[-0.025em] text-foreground mb-2">Page not found</h1>
        <p className="text-[15px] text-muted-foreground mb-8">This page doesn't exist.</p>
        <Link href="/">
          <button className="h-[52px] px-8 rounded-full bg-primary text-primary-foreground text-sm font-semibold uppercase tracking-[0.06em] hover:bg-primary/90 transition-colors">
            Go home
          </button>
        </Link>
      </div>
    </div>
  );
}
