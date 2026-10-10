# FC 27 icon chemistry

Source: [EA FC 27 Launch Update, Chemistry Changes](https://www.ea.com/games/ea-sports-fc/fc-27/news/pitch-notes-fc27-launch-update), checked 2026-10-10.

An in-position icon gets 3 chemistry, adds one increment to every league's
threshold count and one to its own national team. This is a count increment,
not a direct chemistry point for every teammate. FC 27 reduced the national
contribution from two to one. Out-of-position icons contribute nothing.
Historic clubs displayed on Jackson Hub cards do not add a club link in the
new chemistry system. Classic chemistry is a separate existing mode.

In this game's collection all CARD_LEGENDS cards use icon chemistry, including
their Jackson variants. This is a game design mapping, not a claim that all
66 footballers have official EA Icon items. The explicit icon flag is preserved
when converting cards into squad players and when serializing online squads.
Ordinary Jackson and Future Stars cards do not gain icon chemistry.

Validation: engine tests cover automatic full chemistry, alternate positions,
all-league increments, single nation contribution, no historical club boost,
out-of-position exclusion, stacking and the 33 limit. Collection tests cover
nationalities and preservation of the icon marker through squad conversion.

The chooser performance change bounds each visible card grid to 24 cards,
with pagination and full-list name/club search. Browser tests exercise a full
3,454-card collection at a 390px viewport, paging, search, selection, rarity
filters and sort. These checks do not measure performance on an actual iPhone.
