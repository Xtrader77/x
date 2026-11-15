# Trade Journal (replaces the old New Trade form)
Files: planner.html, planner-logic.js (SuperNova v12.2 rules, tested: `node test/planner.test.js`), plans-db.js (drafts, cloud table `trade_plans`, already created in Supabase).
journal.html now just redirects to planner.html. Old trades are untouched. The old form is backed up outside the project.
Flow: Status -> Rules check (red warnings only) -> Pair and mode -> Systems and levels -> Market read -> Mindset -> Review -> Mark planned -> I placed it -> Result -> Log.
Each logged trade stores its plan in mt4_data.plan: per-system level, target, outcome, plan followed, good/bad win or loss.

Update: Market read step has "Fill from today's NOVA brief" (pairs with a brief). It reads the newest `fundamentals_briefs` row for the plan's pair and adds one line to the Short term note (lean, confidence, headline, valid-for, today's events) and sets the short bias only if empty. It never overwrites what you wrote and fails quietly with a message if there is no brief or no access.

## NOVA Journal rebuild (Nov 15)
- App renamed NOVA Journal (titles, sidebar, manifest, PDFs, cache nova-v10).
- shell.css is the single page shell for every app page (loaded after each page's own styles). The content column is
  minmax(0,1fr) so wide charts can no longer push the page past the window edge. Edit layout there, not per page.
- Planner is now 3 steps: The trade (pair, direction, mode, date/time, systems on one screen), Market read (optional), Place it.
  Required: pair, direction, mode, date, time, at least one system. Mode defaults to the last one used, time to now,
  systems to what the ladder says is on. Market read and mindset never block a plan.
