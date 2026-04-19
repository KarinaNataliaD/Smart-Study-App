# Smart Study Planner

A showcase-ready browser app that acts like an adaptive academic coach rather than a simple to-do list.

## Standout Features

- `Next Best Task`: recommends the smartest thing to work on right now
- `Calendar + reality layer`: builds a weekly plan around class, sports, work shifts, commute, and sleep target
- `Study session intelligence`: turns tasks into session types like active recall, practice problems, flashcards, essay outlining, and project milestone sprints
- `Reflection loop`: after a session, the student logs whether they finished it, whether it was too hard, and how focused they felt
- `Persistent planner state`: saves tasks, profile inputs, calendar, reflections, and generated plans in `localStorage`
- `Burnout-aware planning`: adjusts schedule intensity based on energy, stress, sleep, and recent reflection quality
- `Crisis Mode`: creates a rescue plan when deadlines pile up
- `Momentum dashboard`: shows readiness, confidence, streaks, and burnout risk
- `Mentor snapshot`: generates a concise accountability summary

## Design Patterns Used

- `Strategy`: balanced, deadline-first, and energy-saver scheduling modes
- `Observer`: planner updates and reminders react to task, profile, plan, and reflection events
- `Factory`: builds exam, homework, and project task objects
- `Decorator`: adds high-priority and urgent scoring layers
- `Singleton`: the schedule manager owns the shared planner state
- `Command`: undo and redo support for task changes

## Files

- `index.html`: UI structure, calendar, planner controls, and showcase sections
- `style.css`: responsive presentation and visual system
- `app.js`: planner logic, gap-aware schedule generation, reflection learning loop, and pattern implementation

## Run

Open `index.html` in a browser.

## Best Demo Flow

1. Add 3 to 4 tasks with different deadlines, types, and confidence levels.
2. Set a realistic profile with heavier class, work, sports, and commute hours.
3. Generate the plan and walk through the weekly calendar to show that study blocks are placed only in open gaps.
4. Point out how session types vary between active recall, flashcards, practice problems, essay outlining, and project milestone sprints.
5. Click `Reflect On Session`, answer the three prompts, and show how the reminders and plan adapt afterward.
