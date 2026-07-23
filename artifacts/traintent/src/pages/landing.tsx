import { motion } from "framer-motion";
import { Link } from "wouter";
import { Dumbbell, Target, LineChart, User } from "lucide-react";

export default function Landing() {
  return (
    <div className="min-h-screen bg-background flex flex-col selection:bg-primary/30">
      <header className="px-6 lg:px-12 h-20 flex items-center justify-between border-b border-white/5">
        <div className="flex items-center gap-2 font-bold text-xl tracking-tight text-white">
          <div className="w-8 h-8 rounded bg-primary flex items-center justify-center text-primary-foreground text-sm font-bold">
            T
          </div>
          Trainient
        </div>
        <div className="flex items-center gap-4">
          <Link href="/sign-in" className="text-sm font-medium text-white/70 hover:text-white transition-colors">
            Log in
          </Link>
          <Link href="/sign-up" className="inline-flex h-9 items-center justify-center rounded-md bg-white px-4 py-2 text-sm font-medium text-black hover:bg-white/90 transition-colors">
            Start training
          </Link>
        </div>
      </header>

      <main className="flex-1 flex flex-col">
        {/* Hero */}
        <section className="flex-1 flex flex-col items-center justify-center px-6 lg:px-12 py-32 lg:py-48 text-center">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="max-w-3xl"
          >
            <h1 className="text-6xl lg:text-8xl font-bold tracking-tight text-white leading-[1.05]">
              Train With Intent
            </h1>
            <div className="mt-12">
              <Link href="/sign-up" className="inline-flex h-14 items-center justify-center rounded-md bg-primary px-10 text-base font-semibold text-primary-foreground hover:bg-primary/90 transition-colors">
                Start training
              </Link>
            </div>
          </motion.div>
        </section>

        {/* How it works. The AI Coach mode is not part of the alpha, so it is
            not advertised here - promising a mode sign-ups can't reach is the
            fastest way to make the whole page feel broken. */}
        <section className="px-6 lg:px-12 py-24 bg-card/30 border-y border-white/5">
          <div className="max-w-2xl mx-auto text-center">
            <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center mb-6 text-primary mx-auto">
              <User className="w-6 h-6" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-4">You're in control</h2>
            <p className="text-white/60 leading-relaxed">
              Build your own program, log your sessions, and track your progression yourself.
              No algorithm second-guessing your training.
            </p>
          </div>
        </section>

        {/* Features */}
        <section className="px-6 lg:px-12 py-24">
          <div className="max-w-5xl mx-auto">
            <div className="grid md:grid-cols-3 gap-8">
              <div className="p-8 rounded-2xl bg-card border border-white/5 flex flex-col items-start">
                <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center mb-6 text-primary">
                  <Dumbbell className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-semibold text-white mb-3">Structured Programs</h3>
                <p className="text-white/60 leading-relaxed">
                  Build your split day by day - every program is structured around your goals and schedule.
                </p>
              </div>
              <div className="p-8 rounded-2xl bg-card border border-white/5 flex flex-col items-start">
                <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center mb-6 text-primary">
                  <Target className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-semibold text-white mb-3">Session Logging</h3>
                <p className="text-white/60 leading-relaxed">
                  Log weight and reps for every set. Review sessions on a colour-coded calendar.
                </p>
              </div>
              <div className="p-8 rounded-2xl bg-card border border-white/5 flex flex-col items-start">
                <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center mb-6 text-primary">
                  <LineChart className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-semibold text-white mb-3">Progress Tracking</h3>
                <p className="text-white/60 leading-relaxed">
                  Strength curves, volume trends, and personal records. See exactly how you're progressing.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="px-6 lg:px-12 py-24 bg-primary text-primary-foreground text-center">
          <h2 className="text-3xl lg:text-5xl font-bold mb-10">Ready to train with intent?</h2>
          <Link href="/sign-up" className="inline-flex h-14 items-center justify-center rounded-md bg-white px-10 text-lg font-bold text-black hover:bg-white/90 transition-colors shadow-lg">
            Create account
          </Link>
        </section>
      </main>

      <footer className="px-6 lg:px-12 py-8 border-t border-white/5 text-center text-sm text-white/40">
        <p>&copy; {new Date().getFullYear()} Trainient. All rights reserved.</p>
      </footer>
    </div>
  );
}
