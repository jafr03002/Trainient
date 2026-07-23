### Client Check-In Logic and Reprogram Generation

## INTRO
    - This reference document aims to act as a reference for the weekly check-ins in order for the AI to structure future training and habits
    Based on the client check-in variables
    - This document doesnt specify hard-coded rules its rather reference and a document to compare and use for own judgement as well.
    - This document does'nt specify every single situation and every check-in and client is unique therefore use own judgement.
    - All check-ins questioneers shall be compared to the last weeks same questioneers to form a decision. Like if it's a pattern.

# Check-in evluation variables:

- averageWeight
- cardioCompleted
- stepCounts
- caloriesPerDay
- sessionsCompleted
- progressionAcrossSets
- sessionComments

# Check-in qustioneers:

- Did you have any off days where you deviated from the calorie intake and did not log?
    Evaluation: Could indicate that the rate of body weight increase/decrease was off plan and the plan is not likely the issue. Rather a disicpline side form the client. If this is true then dont change the calories. Since we dont have the correct data
- Current hunger and appeteite rate 1-5

    If a client reports 3 use own judgement and base judgement of thee statements:

    IF client is in a diet phase and reports 4-5 && averageWeight-(averageWeightLastWeek) <=-1kg
    THEN: Increase calories slitghly based on your judgement

    IF client is in a diet phase and reports 1-2 && averageWeight-(averageWeightLastWeek) => 0kg
    THEN: Decrease calories slitghly based on your judgement

    IF client is in a bulk phase and reports 4-5 && averageWeight-(averageWeightLastWeek) <=0.5kg
    THEN: Increase calories slitghly based on your judgement

    IF client is in a bulk phase and reports 1-2 && averageWeight-(averageWeightLastWeek) => 1.0kg
    THEN: Decrease calories slitghly based on your judgement

    IF client is in a deload/maintenance phase and reports 4-5 && averageWeight-(averageWeightLastWeek) <=-0.8kg
    THEN: Increase calories slitghly based on your judgement

    If client is in a deload/maintenance phase and reports 1-2 && averageWeight-(averageWeightLastWeek) => 0.8kg
    THEN: Decrease calories slitghly based on your judgement

    IF client is in a high-deficit phase and reports 4-5 && averageWeight-(averageWeightLastWeek) <=-1.5kg
    THEN: Increase calories slitghly based on your judgement

    IF client is in a high-deficit and reports 1-2 && averageWeight-(averageWeightLastWeek) => -0.5kg
    THEN: Decrease calories slitghly based on your judgement

    reverse diet phase is the same as bulk but not as extreme.

- Any issues with excerices (connection, joint/muscle pains?) (if so, client explains)
- What went well this week?
    - Look over it and remind them thta they did a good job there. If they really did then and remind them that in the future if it occurs again
- What did not go well this week and can be improved upon?
    - Look especially into resolving this.
- was there a decline in sleep duration or quality this week, Why?
- Any issues with digestion?

# Training Evaluation:

Ask following questionners of any of the following happens:

GLOSSARY
- e1RM        = weight × (1 + reps/30)   # top set per exercise
- progressed  = this week's best e1RM > last week's for that exercise
- regressed   = this week's best e1RM < last week's
- muscle volume = Σ (weight × reps) across that muscle's working sets this week
- week        = a completed training microcycle

RULE 1 — Fatigue-driven volume regulation
  TRIGGER:  a specific exercise has not progressed or has been stalled for 4 iterations of that session across 4 microcycles
  ASSESS:   ask "How fatigued did <muscle> feel this week? (1–10)"
            anchors → 1 = fresh, full energy
                      5 = noticeably tired but training fine
                     10 = drained, performance clearly impaired
  ACT (next week):
            ≤5   → no volume change; flag non-fatigue cause
                   (sleep / nutrition / technique) for review
            6    → −10% sets for THAT muscle group
            7    → −20% sets for THAT muscle group
            8–9  → −40% TOTAL sets (systemic deload)
            10   → full deload week (≈−60%, light technique work)
  FOLLOW-UP: recheck fatigue + progress next week.
            if recovered & progressing 2 wks → ramp volume back toward baseline
            if still regressing → re-apply / escalate one tier

RULE 1 — Successful volume regulations
  TRIGGER:  a specific exercise has progressed 4 sessions in a row
  ASSESS:   ask "On a scale of 1-10 how challenging this exercise feel to progress:
≤5   → Volume across that exercise is up by 1 set
            6-7   → Check wether other exercises that involves the same muscle group also has progressed and if 80%> of other total sets for that muscle group has progressed then add 1 set else do not
            8–9  → Check wether other exercises that involves the same muscle group also has progressed and if 100%> of other total sets for that muscle group has progressed then add 1 set else do no
            10   → No action

  ACT (next week):
	Stated above
  FOLLOW-UP: recheck fatigue + progress next week.
            if regression is noticeable after 2 weeks with 30%> of total sets across that specific muscle group then revert changes
