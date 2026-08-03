-- One session per draw, enforced by the database.
--
-- Auto-open checked for an existing session and then created one, which is not atomic:
-- two runs overlapping produced two sessions for the same draw, splitting a day's bets
-- across them. A constraint makes that impossible rather than unlikely.
CREATE UNIQUE INDEX "ThreeDSession_business_game_draw_name_key"
    ON "ThreeDSession"("businessId", "gameType", "drawDate", "name");
