## INTRO
Scope:
This document covers the program generation for the AI coaching app Trainient. The below shall be used to generate programs. These programs will be used during the Calibration phase (but not at full intensity) and during the actual training long term phase. Adjustments to the program will only be through Regeneration and Check-ins that are covered in separate documents. This reference document alongside 

## Onboarding questions:
(All steps in AI mode. For your information)
Step 1: mode: AI or independent
Step 2: name
Step 3: bodyStats: Age, weight
Step 4: goal: Gain weight, Lose weigh, General fitness
Step 5: Experience: Beginner, intermediate or advanced
Step 6: activity: low, moderate, high
Step 7: trainingDays: 2-6 days
Step 8: prefered rest Days: Mon-Sun
Step 9: equipment: full gym, dumbbell only, barbell & rack, cable machine, smith machine, resistance bands, pull-up bar, home gym, no equipment.
Step 10: details: sex, injuries
Step 11: priorityMuscles: All the muscles transient covers and “No preference”
Step 12: review: Build your program button

## Backend AI monitoring parameters that will be generated:
Long term phase (Gain weight, lose weight, maintain)
Short term phase (kgs are in weekly weight gain)
calibration (maintenance +/-1kg entering weight into the phase), 
calibration_review (only after at least 1 full week of calibration has passed - the week where the client reviews their calibration data with the coach and exits into whatever phase the goal-evaluation timeline calls for next; never assign this as the very first week),
bulk phase (surplus +0.25 to 0.5kg), 
maintenance (maintenance+/-1kg entering weight into the phase), 
reverse diet (small surplus +0,25 to 0.5kg compared to bulk phase here we are just reversing the diet), 
diet (deficit -0.5kg), 
mini cut (high deficit, -1kg), 
deload  (maintenance+/-1kg entering weight into the phase),
energyBalance (Surplus, maintenance, Deficit, High deficit)
trainingWorkload (How many days trained and total volume)
Long term goal weight trough phases
Short term goal weight trough phases
onbSteps: Low, moderate, high
Cardio intensity 120-130 bpm. low, moderate, high (look up yourself what is high low moderate it all depends on sex weight make own judgements)

## Body stats evaluation:
IF the person selects: Low weight (compare whats low weight for their age online)
THEN trainingWorkload can be increased	

## Goal evaluation with timeline setups template:

This template is a hard sequence, enforced in code at
`artifacts/api-server/src/lib/phaseTemplate.ts` (`PHASE_TEMPLATES`) - the AI is never asked to
choose the short-term phase directly. Its only input is a bounded "stay in this phase one more
week" vs "advance to the next phase" recommendation per check-in, and the server clamps that
recommendation to each phase's min/max week window below. The AI can never invent, skip, or
reorder a phase.

IF: Gaining weight/Building muscle choice
     THEN: Enter calibration week (1-3W) > Bulk phase (18-26W) with a 1-week deload every 8 weeks (deload is a display-only overlay on top of Bulk, not a separate step - see phaseTemplate.ts).
     Nothing is defined once the 26-week ceiling is reached - the phase simply holds there. Reassessing the goal at that point is a separate, not-yet-built feature.

IF: Losing weight/building muscle
     THEN: Enter calibration week (1-3W) > Mini cut 4-6W(HIGH DEFICIT) > Maintenance/deload 1 Week > Diet 4W-14W (depending on weight goal).
     Nothing is defined once Diet ends - the phase simply holds there. `reverse_diet` is a known gap in this template (it's a valid short-term phase, but this sequence never reaches it) - deferred to a future revision alongside goal reassessment.

IF General fitness
     THEN:Enter calibration week (1-3W) > maintenance forever until client changes goals. No weight goals here.

Each short-term phase shall have weight goals. To stay in between certain bodyweight go down to a spciefic or go up to a speicifc

## Experience evaluation:
IF the person selects beginner
THEN Focus on compound movements, learning the techniques and finding a               standardized form. Have a minimum of 2 weeks of “onboarding week”
IF person selects intermediate
THEN Slightly favor more high frequency splits and slightly more volume than advanced

## Activity evaluation:

IF client chooses low/mediate activity and their goal is weight loss or general fitness
THEN increase their steps by 2000steps first week

## Training days evaluation:
2 days - Full body training (all experiences)
3 days - Full body training (beginner) or U/L/U or L/UL/ based on priority muscle groups (intermediate/advanced).
4 days - Full body training paired with U/L days based on needs(beginner) or ULRULRR for the fitting days (intermediate/advanced)
5 days U/L/R repeat (beginner/intermediate), or PPLRUL based on needs (advanced/intermediate)
6 days Only applicable if there exist needs for an advanced only to to PPLRPPL which is very rare noly when volume tolerance is really high and upper body is priority but its an extreme case so refer to 5 days.

Also choose and present a training split and ask them this is a great fit for you but if it doesnt appeal to you you can add them an option like a less frequent approach

## Preferred rest days: 
Strong preference to not put training days here. But it is not strictly prohibited as it is still a preference. But if a session were to land on a specific day. Motivate and renate with the client.
## Equipment:

IF client chooses full gym.
THEN  refer to my examples of my exercise arsenal.
Else: Good luck have fun i have no suggestions 

## details

IF the person selects sex: Female
THEN trainingWorkload can be increased

## Priority muscle groups:

Put them first in the session, and allocate a little more volume across that muscle group than the other.
Run an applicable program for example choose L/U/L over U/L/U for a 3 day program if legs are a priority refer to my reference document on examples.
