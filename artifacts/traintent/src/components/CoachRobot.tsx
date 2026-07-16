// "Coach" — the AI coach mascot. A minimal, all-blue robot head riding a
// genie-style wisp tail that gently bobs, sways, and blinks. Pure inline SVG +
// CSS, no dependencies, crisp at any size, and honors prefers-reduced-motion.
// Rendered as the mascot above every CoachmarkTour bubble (see CoachmarkTour).
export function CoachRobot({ size = 30, className }: { size?: number; className?: string }) {
  return (
    <span className={className} style={{ display: "inline-block", lineHeight: 0 }} aria-hidden={false}>
      <style>{coachCss}</style>
      <svg
        width={size}
        height={(size * 214) / 150}
        viewBox="46 22 150 214"
        role="img"
        aria-label="Coach, your AI training assistant"
        className="coach-robot"
      >
        <g className="coach-float">
          <g className="coach-sway">
            {/* three genie swirls — the tail, tucked behind the head */}
            <path d="M84 170 Q118 150 152 170 Q120 192 84 170 Z" fill="hsl(217 88% 60%)" stroke="hsl(221 83% 44%)" strokeWidth={3.5} strokeLinejoin="round" />
            <path d="M100 186 Q128 170 156 188 Q136 204 106 196 Z" fill="hsl(217 88% 60%)" stroke="hsl(221 83% 44%)" strokeWidth={3} strokeLinejoin="round" />
            <path d="M124 196 Q143 192 158 203 Q171 211 161 218 Q143 212 124 196 Z" fill="hsl(217 88% 60%)" stroke="hsl(221 83% 44%)" strokeWidth={2.5} strokeLinejoin="round" />
            {/* antenna */}
            <line x1="120" y1="58" x2="120" y2="38" stroke="hsl(221 83% 44%)" strokeWidth={4} strokeLinecap="round" />
            <circle cx="120" cy="32" r="6" fill="hsl(199 95% 82%)" stroke="hsl(221 83% 44%)" strokeWidth={2.5} />
            {/* ears */}
            <rect x="52" y="92" width="13" height="34" rx="5" fill="hsl(217 85% 54%)" stroke="hsl(221 83% 44%)" strokeWidth={3} />
            <rect x="175" y="92" width="13" height="34" rx="5" fill="hsl(217 85% 54%)" stroke="hsl(221 83% 44%)" strokeWidth={3} />
            {/* head */}
            <rect x="62" y="58" width="116" height="107" rx="30" fill="hsl(217 91% 62%)" stroke="hsl(221 83% 44%)" strokeWidth={3.5} />
            {/* face panel */}
            <rect x="80" y="74" width="80" height="66" rx="18" fill="hsl(222 47% 16%)" />
            {/* eyes */}
            <rect className="coach-eye" x="94" y="92" width="14" height="24" rx="7" fill="hsl(199 100% 86%)" />
            <rect className="coach-eye" x="132" y="92" width="14" height="24" rx="7" fill="hsl(199 100% 86%)" />
            {/* smile */}
            <path d="M104 126 Q120 138 136 126" fill="none" stroke="hsl(199 100% 86%)" strokeWidth={4} strokeLinecap="round" />
          </g>
        </g>
      </svg>
    </span>
  );
}

// Scoped keyframes. Transform lengths are in the SVG's user-space units, so the
// same values scale proportionally at any rendered `size`.
const coachCss = `
.coach-robot .coach-float { animation: coach-float 3.6s ease-in-out infinite; }
.coach-robot .coach-sway { animation: coach-sway 6s ease-in-out infinite; transform-origin: 50% 90%; }
.coach-robot .coach-eye { animation: coach-blink 4.4s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
@keyframes coach-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-13px); } }
@keyframes coach-sway { 0%, 100% { transform: rotate(-2.2deg); } 50% { transform: rotate(2.2deg); } }
@keyframes coach-blink { 0%, 7%, 100% { transform: scaleY(1); } 3.5% { transform: scaleY(0.1); } }
@media (prefers-reduced-motion: reduce) {
  .coach-robot .coach-float,
  .coach-robot .coach-sway,
  .coach-robot .coach-eye { animation: none; }
}
`;
