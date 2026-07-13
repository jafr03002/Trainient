# AI Onboarding — Reference Client Profiles

Purpose: a reference set of realistic, diverse client profiles for prompting/evaluating the program-generation model. Each profile walks through the real 12-step **AI Coach mode** onboarding flow (`mode → name → bodyStats → goal → experience → activity → trainingDays → preferredRestDays → equipment → details → priorityMuscles → review`), as implemented in `artifacts/traintent/src/pages/onboarding.tsx`.

16 profiles per goal category (**lose weight**, **gain weight**, **general fitness**) = 48 total. Each includes a short **Persona note** for background/motivation context — this is *not* a form field, it exists only to help calibrate diverse, realistic examples.

Field values are drawn from the actual onboarding option sets:
- `goal`: `lose_weight` | `gain_weight` | `general`
- `experience`: `beginner` | `intermediate` | `advanced`
- `activityLevel`: `low` | `moderate` | `high`
- `equipment`: `Full gym` (exclusive), `Dumbbells only`, `Barbell & rack`, `Cable machines`, `Smith machine`, `Resistance bands`, `Pull-up bar`, `Home gym`, `No equipment`
- `injurySeverity`: `low` | `medium` | `high` (only set when `injuries` is non-empty)
- `priorityMuscles`: up to 3 of `Chest, Shoulders, Biceps, Triceps, Upper Back, Lats, Quads, Hamstrings, Glutes, Calves, Core`, or `No preference` (exclusive)
- `preferredRestDays`: count is capped at `7 - trainingDays + 1`

---

## Section A — Lose Weight (16)

### A1. Jordan Ellis
Persona: 41, marketing manager, three kids, desk job, hasn't trained consistently since college; wants something simple he won't quit.
- Step 2 Name: Jordan Ellis
- Step 3 Body stats: Age 41 · Weight 210 lbs
- Step 4 Goal: `lose_weight` → goal weight 185 lbs
- Step 5 Experience: `beginner`
- Step 6 Activity level: `low`
- Step 7 Training days: 3
- Step 8 Preferred rest days: Wed, Sat, Sun
- Step 9 Equipment: Dumbbells only, Home gym
- Step 10 Details: Sex male · Injuries: "tight lower back after long car rides" · Severity: low
- Step 11 Priority muscles: No preference

### A2. Priya Nair
Persona: 29, ICU nurse working rotating night shifts, wants fat loss without wrecking her already-disrupted sleep/recovery.
- Step 3: Age 29 · Weight 71 kg
- Step 4: `lose_weight` → 62 kg
- Step 5: `intermediate`
- Step 6: `moderate`
- Step 7: 4 days
- Step 8: Tue, Sun
- Step 9: Full gym
- Step 10: Sex female · Injuries: none
- Step 11: Glutes, Core

### A3. Marcus Webb
Persona: 55, retired firefighter, out of the field for two years and has put on weight; wants to rebuild without aggravating his knees.
- Step 3: Age 55 · Weight 245 lbs
- Step 4: `lose_weight` → 215 lbs
- Step 5: `beginner`
- Step 6: `low`
- Step 7: 2 days
- Step 8: Mon, Wed, Thu, Sat, Sun (max allowed: 6)
- Step 9: Resistance bands, Home gym
- Step 10: Sex male · Injuries: "right knee meniscus tear, surgically repaired 2019" · Severity: medium
- Step 11: No preference

### A4. Sofia Torres
Persona: 34, new mother 5 months postpartum, cleared by her OB for exercise, wants to lose baby weight and rebuild core safely.
- Step 3: Age 34 · Weight 168 lbs
- Step 4: `lose_weight` → 145 lbs
- Step 5: `beginner`
- Step 6: `low`
- Step 7: 3 days
- Step 8: Tue, Thu, Sun
- Step 9: No equipment
- Step 10: Sex female · Injuries: "mild diastasis recti, cleared for exercise by OB" · Severity: medium
- Step 11: Core

### A5. Daniel Kim
Persona: 47, software engineer, lifted seriously in his 20s, fully sedentary for a decade, wants to lose the gut he's built up.
- Step 3: Age 47 · Weight 224 lbs
- Step 4: `lose_weight` → 195 lbs
- Step 5: `intermediate`
- Step 6: `moderate`
- Step 7: 5 days
- Step 8: Wed, Sun, Sat
- Step 9: Full gym
- Step 10: Sex male · Injuries: none
- Step 11: No preference

### A6. Aisha Bello
Persona: 23, university student and former competitive sprinter, recovering from an ankle injury, wants to lose weight gained during her layoff.
- Step 3: Age 23 · Weight 68 kg
- Step 4: `lose_weight` → 60 kg
- Step 5: `advanced`
- Step 6: `high`
- Step 7: 4 days
- Step 8: Mon, Fri, Sun, Sat
- Step 9: Home gym, Resistance bands, Pull-up bar
- Step 10: Sex female · Injuries: "healed ankle sprain, occasional stiffness" · Severity: low
- Step 11: Glutes, Hamstrings, Calves

### A7. Tom O'Malley
Persona: 60, retired postal worker, type 2 diabetic, doctor recommended supervised weight loss; had a hip replacement two years ago.
- Step 3: Age 60 · Weight 232 lbs
- Step 4: `lose_weight` → 200 lbs
- Step 5: `beginner`
- Step 6: `low`
- Step 7: 2 days
- Step 8: Tue, Wed, Thu, Fri, Sat, Sun (max 6)
- Step 9: No equipment
- Step 10: Sex male · Injuries: "left hip replacement, cleared for low-impact activity" · Severity: high
- Step 11: No preference

### A8. Grace Lin
Persona: 38, remote product manager, high work stress and stress-eating, wants structure and accountability more than a specific number.
- Step 3: Age 38 · Weight 176 lbs
- Step 4: `lose_weight` → 155 lbs
- Step 5: `intermediate`
- Step 6: `moderate`
- Step 7: 4 days
- Step 8: Mon, Sun
- Step 9: Dumbbells only
- Step 10: Sex female · Injuries: "mild shoulder impingement, left side" · Severity: low
- Step 11: No preference

### A9. Andre Silva
Persona: 26, warehouse picker on his feet all day, already fairly active physically but wants visible fat loss and definition.
- Step 3: Age 26 · Weight 198 lbs
- Step 4: `lose_weight` → 175 lbs
- Step 5: `intermediate`
- Step 6: `high`
- Step 7: 5 days
- Step 8: Wed, Sun
- Step 9: Full gym
- Step 10: Sex male · Injuries: none
- Step 11: Core, Triceps

### A10. Rachel Kim
Persona: 50, high school teacher, menopause-related weight gain over the last few years, wants a sustainable routine around knee arthritis.
- Step 3: Age 50 · Weight 181 lbs
- Step 4: `lose_weight` → 160 lbs
- Step 5: `beginner`
- Step 6: `low`
- Step 7: 3 days
- Step 8: Tue, Thu, Sat
- Step 9: Home gym
- Step 10: Sex female · Injuries: "mild osteoarthritis, both knees" · Severity: medium
- Step 11: No preference

### A11. Chris Anand
Persona: 33, long-haul truck driver, irregular schedule and limited access to equipment on the road.
- Step 3: Age 33 · Weight 215 lbs
- Step 4: `lose_weight` → 190 lbs
- Step 5: `beginner`
- Step 6: `low`
- Step 7: 2 days
- Step 8: Mon, Tue, Wed, Fri, Sat, Sun (max 6)
- Step 9: Resistance bands
- Step 10: Sex male · Injuries: none
- Step 11: No preference

### A12. Natalie Brooks
Persona: 45, elementary school teacher, wants to lose weight gained over years of high stress and irregular eating.
- Step 3: Age 45 · Weight 172 lbs
- Step 4: `lose_weight` → 150 lbs
- Step 5: `intermediate`
- Step 6: `moderate`
- Step 7: 4 days
- Step 8: Wed, Sun
- Step 9: Full gym
- Step 10: Sex female · Injuries: "mild wrist tendonitis, right side" · Severity: low
- Step 11: Glutes, Core

### A13. Omar Haddad
Persona: 31, former college athlete, sales job now, cutting weight for his wedding in 4 months and wants an aggressive but sound plan.
- Step 3: Age 31 · Weight 205 lbs
- Step 4: `lose_weight` → 180 lbs
- Step 5: `advanced`
- Step 6: `high`
- Step 7: 6 days
- Step 8: Sun
- Step 9: Full gym
- Step 10: Sex male · Injuries: none
- Step 11: Chest, Core

### A14. Emily Zhao
Persona: 27, graphic designer, recently diagnosed with PCOS, weight loss recommended by her doctor as part of managing symptoms.
- Step 3: Age 27 · Weight 178 lbs
- Step 4: `lose_weight` → 155 lbs
- Step 5: `beginner`
- Step 6: `low`
- Step 7: 3 days
- Step 8: Mon, Thu, Sun
- Step 9: Dumbbells only, Resistance bands
- Step 10: Sex female · Injuries: none
- Step 11: No preference

### A15. Victor Osei
Persona: 52, sales executive, constant travel and hotel gyms, wants a flexible plan he can run anywhere.
- Step 3: Age 52 · Weight 220 lbs
- Step 4: `lose_weight` → 195 lbs
- Step 5: `intermediate`
- Step 6: `moderate`
- Step 7: 3 days
- Step 8: Wed, Sat, Sun
- Step 9: No equipment
- Step 10: Sex male · Injuries: "right shoulder rotator cuff strain" · Severity: medium
- Step 11: No preference

### A16. Lauren Fischer
Persona: 36, former D1 soccer player, desk job now, regained weight since quitting competitive sport a decade ago.
- Step 3: Age 36 · Weight 175 lbs
- Step 4: `lose_weight` → 155 lbs
- Step 5: `advanced`
- Step 6: `moderate`
- Step 7: 5 days
- Step 8: Wed, Sun
- Step 9: Full gym
- Step 10: Sex female · Injuries: "ACL reconstruction, left knee, 2016" · Severity: low
- Step 11: Quads, Glutes

---

## Section B — Gain Weight (16)

### B1. Ethan Brooks
Persona: 20, college sophomore, classic ectomorph "hardgainer," has never been able to put on weight despite eating a lot.
- Step 3: Age 20 · Weight 138 lbs
- Step 4: `gain_weight` → 160 lbs
- Step 5: `beginner`
- Step 6: `low`
- Step 7: 4 days
- Step 8: Tue, Thu, Sun
- Step 9: Full gym
- Step 10: Sex male · Injuries: none
- Step 11: Chest, Biceps

### B2. Mei Tanaka
Persona: 24, graphic designer, recovering from a long anemia-driven illness, doctor recommended she regain weight and rebuild strength gradually.
- Step 3: Age 24 · Weight 98 lbs
- Step 4: `gain_weight` → 115 lbs
- Step 5: `beginner`
- Step 6: `low`
- Step 7: 3 days
- Step 8: Mon, Wed, Fri, Sun
- Step 9: Dumbbells only
- Step 10: Sex female · Injuries: none
- Step 11: No preference

### B3. Jake Sullivan
Persona: 19, incoming college football walk-on, needs to add size and strength over the off-season to compete for a roster spot.
- Step 3: Age 19 · Weight 172 lbs
- Step 4: `gain_weight` → 195 lbs
- Step 5: `intermediate`
- Step 6: `high`
- Step 7: 5 days
- Step 8: Wed, Sun
- Step 9: Full gym
- Step 10: Sex male · Injuries: "prior right shoulder dislocation, fully rehabbed" · Severity: low
- Step 11: Chest, Shoulders

### B4. Fatima Rahman
Persona: 31, in structured recovery from a past eating disorder, working with a treatment team; onboarding coach frames this purely as gentle, doctor-approved weight gain.
- Step 3: Age 31 · Weight 105 lbs
- Step 4: `gain_weight` → 120 lbs
- Step 5: `beginner`
- Step 6: `low`
- Step 7: 2 days
- Step 8: Mon, Tue, Thu, Sat, Sun (max 6)
- Step 9: No equipment
- Step 10: Sex female · Injuries: none
- Step 11: No preference

### B5. Carlos Mendez
Persona: 45, accountant, has been thin his entire life and has never strength trained; wants to build some real muscle for the first time.
- Step 3: Age 45 · Weight 152 lbs
- Step 4: `gain_weight` → 170 lbs
- Step 5: `beginner`
- Step 6: `low`
- Step 7: 3 days
- Step 8: Wed, Sat, Sun
- Step 9: Dumbbells only, Home gym
- Step 10: Sex male · Injuries: none
- Step 11: No preference

### B6. Grace Park
Persona: 27, marathon runner, wants to add muscle mass in her off-season without sacrificing too much of her running fitness.
- Step 3: Age 27 · Weight 118 lbs
- Step 4: `gain_weight` → 128 lbs
- Step 5: `advanced`
- Step 6: `high`
- Step 7: 4 days
- Step 8: Tue, Sun
- Step 9: Full gym
- Step 10: Sex female · Injuries: "IT band syndrome, right leg, intermittent" · Severity: low
- Step 11: Glutes, Hamstrings

### B7. Liam O'Connor
Persona: 22, recent grad, "skinny-fat," wants to build visible muscle while cleaning up body composition generally.
- Step 3: Age 22 · Weight 165 lbs
- Step 4: `gain_weight` → 178 lbs
- Step 5: `intermediate`
- Step 6: `moderate`
- Step 7: 5 days
- Step 8: Wed, Sun
- Step 9: Full gym
- Step 10: Sex male · Injuries: none
- Step 11: Chest, Core

### B8. Hana Kobayashi
Persona: 34, breastfeeding mother of a 7-month-old, has lost more weight than intended and wants to rebuild strength and mass, cleared by her doctor.
- Step 3: Age 34 · Weight 112 lbs
- Step 4: `gain_weight` → 125 lbs
- Step 5: `beginner`
- Step 6: `low`
- Step 7: 3 days
- Step 8: Tue, Thu, Sun
- Step 9: Home gym
- Step 10: Sex female · Injuries: "mild diastasis recti, cleared for exercise" · Severity: low
- Step 11: Core

### B9. Derek Johnson
Persona: 29, quit smoking 8 months ago and lost weight during the transition, now wants to rebuild a healthier body.
- Step 3: Age 29 · Weight 148 lbs
- Step 4: `gain_weight` → 168 lbs
- Step 5: `intermediate`
- Step 6: `moderate`
- Step 7: 4 days
- Step 8: Wed, Sat, Sun
- Step 9: Dumbbells only, Resistance bands
- Step 10: Sex male · Injuries: none
- Step 11: No preference

### B10. Isabella Conti
Persona: 25, professional ballet dancer, wants more functional muscle and strength for lifts and partnering work without excessive bulk.
- Step 3: Age 25 · Weight 108 lbs
- Step 4: `gain_weight` → 118 lbs
- Step 5: `intermediate`
- Step 6: `high`
- Step 7: 4 days
- Step 8: Mon, Fri, Sun, Sat
- Step 9: Full gym
- Step 10: Sex female · Injuries: "chronic ankle tendinitis" · Severity: low
- Step 11: Calves, Core

### B11. Ben Wachira
Persona: 37, cancer survivor, cleared by his oncologist to begin rebuilding weight and strength lost during chemotherapy.
- Step 3: Age 37 · Weight 135 lbs
- Step 4: `gain_weight` → 160 lbs
- Step 5: `beginner`
- Step 6: `low`
- Step 7: 3 days
- Step 8: Tue, Thu, Sat, Sun
- Step 9: Dumbbells only
- Step 10: Sex male · Injuries: "post-chemotherapy fatigue, cleared for light training by oncologist" · Severity: medium
- Step 11: No preference

### B12. Olivia Turner
Persona: 21, competitive collegiate swimmer, wants to add muscle mass during the off-season to improve power in the water.
- Step 3: Age 21 · Weight 132 lbs
- Step 4: `gain_weight` → 145 lbs
- Step 5: `advanced`
- Step 6: `high`
- Step 7: 5 days
- Step 8: Wed, Sun
- Step 9: Full gym
- Step 10: Sex female · Injuries: "shoulder impingement, both sides" · Severity: medium
- Step 11: Shoulders, Upper Back

### B13. Samir Patel
Persona: 26, lifelong vegetarian, struggles to eat and gain enough to support muscle growth despite training regularly.
- Step 3: Age 26 · Weight 145 lbs
- Step 4: `gain_weight` → 162 lbs
- Step 5: `beginner`
- Step 6: `low`
- Step 7: 4 days
- Step 8: Tue, Fri, Sun
- Step 9: Home gym
- Step 10: Sex male · Injuries: none
- Step 11: No preference

### B14. Zoe Martin
Persona: 30, recreational runner recovering from a tibial stress fracture, wants to rebuild lost weight and lower-body strength safely.
- Step 3: Age 30 · Weight 122 lbs
- Step 4: `gain_weight` → 132 lbs
- Step 5: `beginner`
- Step 6: `low`
- Step 7: 2 days
- Step 8: Mon, Wed, Fri, Sat, Sun (max 6)
- Step 9: No equipment
- Step 10: Sex female · Injuries: "healed tibial stress fracture, right leg" · Severity: medium
- Step 11: No preference

### B15. Noah Kessler
Persona: 55, semi-retired consultant, doctor flagged early signs of age-related muscle loss and recommended resistance training.
- Step 3: Age 55 · Weight 158 lbs
- Step 4: `gain_weight` → 172 lbs
- Step 5: `intermediate`
- Step 6: `moderate`
- Step 7: 3 days
- Step 8: Wed, Sat, Sun
- Step 9: Full gym
- Step 10: Sex male · Injuries: "mild hip osteoarthritis" · Severity: low
- Step 11: No preference

### B16. Priya Chandran
Persona: 24, IT support specialist, naturally slim, wants to gain weight and build some muscle for the first time in her life.
- Step 3: Age 24 · Weight 102 lbs
- Step 4: `gain_weight` → 118 lbs
- Step 5: `beginner`
- Step 6: `low`
- Step 7: 3 days
- Step 8: Tue, Thu, Sun
- Step 9: Dumbbells only, Resistance bands
- Step 10: Sex female · Injuries: none
- Step 11: No preference

---

## Section C — General Fitness (16)

*No `goalWeight` is collected for this goal — the weight-goal modal only triggers for `lose_weight`/`gain_weight`.*

### C1. Sam Rivera
Persona: 34, IT support tech, mostly sedentary, just wants more energy and to feel healthier day to day — no specific number in mind.
- Step 3: Age 34 · Weight 190 lbs
- Step 4: `general`
- Step 5: `beginner`
- Step 6: `low`
- Step 7: 3 days
- Step 8: Wed, Sat, Sun
- Step 9: Home gym
- Step 10: Sex male · Injuries: none
- Step 11: No preference

### C2. Karen Lee
Persona: 48, post-menopausal, doctor recommended resistance training for bone density and long-term health.
- Step 3: Age 48 · Weight 165 lbs
- Step 4: `general`
- Step 5: `intermediate`
- Step 6: `moderate`
- Step 7: 4 days
- Step 8: Wed, Sun
- Step 9: Full gym
- Step 10: Sex female · Injuries: "mild osteoporosis, lumbar spine" · Severity: low
- Step 11: No preference

### C3. Tyler Brooks
Persona: 26, weekend hiker and backpacker, wants better general conditioning to handle longer, harder trails.
- Step 3: Age 26 · Weight 175 lbs
- Step 4: `general`
- Step 5: `intermediate`
- Step 6: `high`
- Step 7: 4 days
- Step 8: Tue, Sun
- Step 9: No equipment
- Step 10: Sex male · Injuries: none
- Step 11: Quads, Calves

### C4. Dana Whitfield
Persona: 39, corporate lawyer, high-stress job, wants consistent exercise mainly for stress relief and mental clarity.
- Step 3: Age 39 · Weight 150 lbs
- Step 4: `general`
- Step 5: `beginner`
- Step 6: `low`
- Step 7: 3 days
- Step 8: Mon, Thu, Sun
- Step 9: Dumbbells only
- Step 10: Sex female · Injuries: none
- Step 11: No preference

### C5. Miguel Santos
Persona: 44, father of three, wants general functional fitness so he can keep up with his kids and avoid nagging injuries.
- Step 3: Age 44 · Weight 205 lbs
- Step 4: `general`
- Step 5: `beginner`
- Step 6: `low`
- Step 7: 3 days
- Step 8: Wed, Sat, Sun
- Step 9: Resistance bands, Home gym
- Step 10: Sex male · Injuries: "occasional lower back soreness" · Severity: low
- Step 11: Core

### C6. Hannah Cole
Persona: 29, avid rock climber, wants general strength and conditioning work to support her climbing.
- Step 3: Age 29 · Weight 128 lbs
- Step 4: `general`
- Step 5: `advanced`
- Step 6: `high`
- Step 7: 5 days
- Step 8: Wed, Sun
- Step 9: Full gym
- Step 10: Sex female · Injuries: "A2 pulley strain, right ring finger" · Severity: low
- Step 11: Core, Upper Back

### C7. Aaron Blake
Persona: 51, mechanical engineer, desk-bound, wants to stop the slow physical decline he's noticed over the last few years.
- Step 3: Age 51 · Weight 198 lbs
- Step 4: `general`
- Step 5: `beginner`
- Step 6: `low`
- Step 7: 2 days
- Step 8: Tue, Wed, Fri, Sat, Sun, Mon (max 6)
- Step 9: No equipment
- Step 10: Sex male · Injuries: none
- Step 11: No preference

### C8. Isla Fraser
Persona: 33, yoga instructor, wants to add structured strength training to complement her flexibility-heavy practice.
- Step 3: Age 33 · Weight 135 lbs
- Step 4: `general`
- Step 5: `intermediate`
- Step 6: `moderate`
- Step 7: 3 days
- Step 8: Tue, Thu, Sun
- Step 9: Dumbbells only, Resistance bands
- Step 10: Sex female · Injuries: none
- Step 11: Shoulders, Core

### C9. Devon Marsh
Persona: 22, full-time streamer/gamer, wants to counteract a very sedentary lifestyle before it becomes a bigger problem.
- Step 3: Age 22 · Weight 182 lbs
- Step 4: `general`
- Step 5: `beginner`
- Step 6: `low`
- Step 7: 3 days
- Step 8: Mon, Wed, Sun
- Step 9: Home gym
- Step 10: Sex male · Injuries: "mild carpal tunnel discomfort, both wrists" · Severity: low
- Step 11: No preference

### C10. Renée Dubois
Persona: 60, recently retired, wants to maintain independence, balance, and mobility for the long haul.
- Step 3: Age 60 · Weight 148 lbs
- Step 4: `general`
- Step 5: `beginner`
- Step 6: `low`
- Step 7: 2 days
- Step 8: Mon, Tue, Wed, Fri, Sat, Sun (max 6)
- Step 9: Resistance bands
- Step 10: Sex female · Injuries: "right knee replacement, 2023" · Severity: medium
- Step 11: No preference

### C11. Kwame Asante
Persona: 37, plays in a competitive amateur soccer league, wants general athleticism, speed, and injury resilience.
- Step 3: Age 37 · Weight 172 lbs
- Step 4: `general`
- Step 5: `advanced`
- Step 6: `high`
- Step 7: 5 days
- Step 8: Wed, Sun
- Step 9: Full gym
- Step 10: Sex male · Injuries: "prior hamstring strain, left leg" · Severity: low
- Step 11: Hamstrings, Quads

### C12. Julia Novak
Persona: 41, recently divorced, wants general fitness as part of rebuilding routine and confidence.
- Step 3: Age 41 · Weight 160 lbs
- Step 4: `general`
- Step 5: `beginner`
- Step 6: `moderate`
- Step 7: 4 days
- Step 8: Wed, Sun
- Step 9: Full gym
- Step 10: Sex female · Injuries: none
- Step 11: No preference

### C13. Brian Cho
Persona: 28, trains Brazilian jiu-jitsu a few times a week, wants supplemental strength work to support his grappling.
- Step 3: Age 28 · Weight 176 lbs
- Step 4: `general`
- Step 5: `intermediate`
- Step 6: `high`
- Step 7: 4 days
- Step 8: Tue, Sun
- Step 9: Full gym
- Step 10: Sex male · Injuries: "mild wrist strain, right side" · Severity: low
- Step 11: Core, Upper Back

### C14. Megan O'Brien
Persona: 35, age-group triathlete, off-season, wants general strength maintenance without interfering with next season's base training.
- Step 3: Age 35 · Weight 130 lbs
- Step 4: `general`
- Step 5: `advanced`
- Step 6: `high`
- Step 7: 4 days
- Step 8: Wed, Sun
- Step 9: Full gym
- Step 10: Sex female · Injuries: none
- Step 11: No preference

### C15. Felix Grant
Persona: 63, retired, wants to stay active, mobile, and independent well into old age.
- Step 3: Age 63 · Weight 178 lbs
- Step 4: `general`
- Step 5: `beginner`
- Step 6: `low`
- Step 7: 3 days
- Step 8: Tue, Thu, Sat, Sun
- Step 9: No equipment
- Step 10: Sex male · Injuries: "mild lower back stiffness in the mornings" · Severity: low
- Step 11: No preference

### C16. Ana Beatriz Souza
Persona: 25, ER nurse, physically demanding job on her feet all shift, wants general conditioning and injury-prevention strength, not weight-focused.
- Step 3: Age 25 · Weight 142 lbs
- Step 4: `general`
- Step 5: `intermediate`
- Step 6: `high`
- Step 7: 3 days
- Step 8: Tue, Fri, Sun
- Step 9: Home gym, Resistance bands
- Step 10: Sex female · Injuries: none
- Step 11: Core, Glutes

---

## How to use these examples

- Each profile's Steps 3–11 map directly to `UserProfileInput` fields (`age`, `weight`/`weightUnit`, `goal`/`goalWeight`, `experience`, `activityLevel`, `trainingDays`, `preferredRestDays`, `equipment`, `sex`, `injuries`/`injurySeverity`, `priorityMuscles`).
- The **Persona** line is deliberately outside the schema — use it to sanity-check that generated programs make sense for the person's real-world context (e.g., a truck driver with no equipment shouldn't get a barbell program), not as literal input to the model.
- `mode` is `ai` for all 48 (this is the 12-step flow); Step 12 (`review`) has no new fields — it's where `createProfile` is called and the program is generated.
