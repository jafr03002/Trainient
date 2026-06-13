import { motion } from "framer-motion";
import { Link } from "wouter";
import { Dumbbell, Target, LineChart, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Landing() {
  return (
    <div className="min-h-screen bg-background flex flex-col selection:bg-primary/30">
      <header className="px-6 lg:px-12 h-20 flex items-center justify-between border-b border-white/5">
        <div className="flex items-center gap-2 font-bold text-xl tracking-tight text-white">
          <div className="w-8 h-8 rounded bg-primary flex items-center justify-center text-primary-foreground">
            T
          </div>
          Traintent
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
        <section className="px-6 lg:px-12 py-24 lg:py-32 flex flex-col items-center text-center max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm font-medium text-white/80 mb-8 backdrop-blur-md">
              <span className="flex h-2 w-2 rounded-full bg-primary mr-2"></span>
              Precision AI Coaching
            </div>
            <h1 className="text-5xl lg:text-7xl font-bold tracking-tight text-white mb-6 leading-[1.1]">
              Serious training demands <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-blue-400">serious coaching.</span>
            </h1>
            <p className="text-lg lg:text-xl text-white/60 mb-10 max-w-2xl mx-auto">
              Replace guesswork with an AI that understands progressive overload, RPE, and periodization. Traintent builds and adjusts your program weekly based on actual performance.
            </p>
            <div className="flex flex-col sm:flex-row items-center gap-4 justify-center">
              <Link href="/sign-up" className="inline-flex h-12 items-center justify-center rounded-md bg-primary px-8 text-base font-semibold text-primary-foreground hover:bg-primary/90 transition-colors">
                Start your program
                <ChevronRight className="ml-2 w-4 h-4" />
              </Link>
            </div>
          </motion.div>
        </section>

        {/* Features */}
        <section className="px-6 lg:px-12 py-24 bg-card/30 border-y border-white/5">
          <div className="max-w-6xl mx-auto">
            <div className="grid md:grid-cols-3 gap-8">
              <div className="p-8 rounded-2xl bg-card border border-white/5 flex flex-col items-start">
                <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center mb-6 text-primary">
                  <Dumbbell className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-semibold text-white mb-3">Bespoke Programs</h3>
                <p className="text-white/60 leading-relaxed">
                  Tailored to your equipment, experience, and specific goals. No cookie-cutter templates.
                </p>
              </div>
              <div className="p-8 rounded-2xl bg-card border border-white/5 flex flex-col items-start">
                <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center mb-6 text-primary">
                  <Target className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-semibold text-white mb-3">Weekly Adjustments</h3>
                <p className="text-white/60 leading-relaxed">
                  Check in weekly. The AI analyzes your fatigue and progress, updating volume and intensity automatically.
                </p>
              </div>
              <div className="p-8 rounded-2xl bg-card border border-white/5 flex flex-col items-start">
                <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center mb-6 text-primary">
                  <LineChart className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-semibold text-white mb-3">Track Everything</h3>
                <p className="text-white/60 leading-relaxed">
                  Log sets, reps, and RPE. Watch your volume and strength metrics climb over time.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="px-6 lg:px-12 py-24 max-w-4xl mx-auto text-center">
          <h2 className="text-3xl lg:text-4xl font-bold text-white mb-16">How it works</h2>
          <div className="space-y-12">
            <div className="flex flex-col md:flex-row gap-6 items-center text-left">
              <div className="w-16 h-16 shrink-0 rounded-full bg-card border border-white/10 flex items-center justify-center text-2xl font-bold text-primary">1</div>
              <div>
                <h4 className="text-xl font-semibold text-white mb-2">Set your parameters</h4>
                <p className="text-white/60">Tell the AI your goal, available equipment, how many days you can train, and what muscles you want to prioritize.</p>
              </div>
            </div>
            <div className="flex flex-col md:flex-row gap-6 items-center text-left">
              <div className="w-16 h-16 shrink-0 rounded-full bg-card border border-white/10 flex items-center justify-center text-2xl font-bold text-primary">2</div>
              <div>
                <h4 className="text-xl font-semibold text-white mb-2">Train and log</h4>
                <p className="text-white/60">Hit the gym with a structured plan. Log your sets, reps, and RPE directly in the app during your session.</p>
              </div>
            </div>
            <div className="flex flex-col md:flex-row gap-6 items-center text-left">
              <div className="w-16 h-16 shrink-0 rounded-full bg-card border border-white/10 flex items-center justify-center text-2xl font-bold text-primary">3</div>
              <div>
                <h4 className="text-xl font-semibold text-white mb-2">Check-in & adapt</h4>
                <p className="text-white/60">Report your fatigue, sleep, and soreness at the end of the week. Get a newly optimized program for next week.</p>
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="px-6 lg:px-12 py-24 bg-primary text-primary-foreground text-center">
          <h2 className="text-3xl lg:text-5xl font-bold mb-6">Ready to get serious?</h2>
          <p className="text-lg text-primary-foreground/80 mb-10 max-w-xl mx-auto">
            Stop guessing and start progressing. Join Traintent today.
          </p>
          <Link href="/sign-up" className="inline-flex h-14 items-center justify-center rounded-md bg-white px-10 text-lg font-bold text-black hover:bg-white/90 transition-colors shadow-lg">
            Create account
          </Link>
        </section>
      </main>

      <footer className="px-6 lg:px-12 py-8 border-t border-white/5 text-center text-sm text-white/40">
        <p>&copy; {new Date().getFullYear()} Traintent. All rights reserved.</p>
      </footer>
    </div>
  );
}
