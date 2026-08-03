-- One session per 2D draw, enforced by the database.
--
-- Auto-open checked for an existing session and then created one, which is not atomic:
-- two runs overlapping produced two sessions for the same draw, splitting a day's bets
-- across them. A constraint makes that impossible rather than unlikely.
--
-- Restricted to 2D on purpose. Those are the ones the app creates on a schedule, so a
-- duplicate is always a bug. 3D sessions are made by hand, where two sessions sharing a
-- name on one date is a person's decision, not a race — and some shops already have them.
CREATE UNIQUE INDEX "ThreeDSession_two_d_draw_key"
    ON "ThreeDSession"("businessId", "drawDate", "name")
    WHERE "gameType" = 'TWO_D';
