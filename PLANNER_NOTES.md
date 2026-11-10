# Trade Planner (replaces the old New Trade form)
Files: planner.html, planner-logic.js (SuperNova v12.2 rules, tested: `node test/planner.test.js`), plans-db.js (drafts, cloud table `trade_plans`, already created in Supabase).
journal.html now just redirects to planner.html. Old trades are untouched. The old form is backed up outside the project.
Flow: Status -> Rules check (red warnings only) -> Pair and mode -> Systems and levels -> Market read -> Mindset -> Review -> Mark planned -> I placed it -> Result -> Log.
Each logged trade stores its plan in mt4_data.plan: per-system level, target, outcome, plan followed, good/bad win or loss.
