# Compare a BoardDraft against the player-corrected Shadowboxing save.
#
#   jq -n --slurpfile draft draft.json --slurpfile save corrected-save.json \
#     -f .agents/skills/40k-roster-coach/assets/draft-eval.jq > draft-eval.json
#
# Units join on player + unit_id; a draft unit without unit_id is an error.
# Save positions are y-up world inches; the draft is y-down, so save y becomes
# 44 - y. Status derives from surviving models: none alive is destroyed, then
# reserve, army box, embarked, else on board. Centroid error is reported only
# when both sides place the unit on the board.

# Embarked models are also flagged `in_reserves`, so the transport check must
# come first.
def mean: add / length;
def key: "\(.player):\(.unit_id)";

($save[0].armies.models | group_by(key) | map(
    (map(select(.is_killed | not))) as $alive
    | {key: (.[0] | key), value: {
        status: (if ($alive | length) == 0 then "destroyed"
                 elif any($alive[]; .transport_unit_id != null) then "embarked"
                 elif any($alive[]; .in_army_box) then "army_box"
                 elif any($alive[]; .in_reserves) then "reserve"
                 else "on_board" end),
        models_alive: ($alive | length),
        centroid: (if ($alive | length) == 0 then null
                   else [($alive | map(.position[0]) | mean), (44 - ($alive | map(.position[1]) | mean))] end)}})
  | from_entries) as $truth
| [$draft[0].units[]
    | if .unit_id == null then error("draft unit \(.name) needs a unit_id") else . end
    | $truth[key] as $t
    | {
        player, unit_id, name,
        confidence: (.confidence // "inferred"),
        draft_status: .status.kind,
        corrected_status: $t.status,
        status_match: (.status.kind == $t.status),
        models_match: (if .models_remaining == null then null else .models_remaining == $t.models_alive end),
        centroid_error_inches: (
          (.placement.centroid // (.placement.positions // null
            | if . == null then null else [(map(.[0]) | mean), (map(.[1]) | mean)] end)) as $c
          | if $c == null or $t.centroid == null or .status.kind != "on_board" or $t.status != "on_board" then null
            else ((($c[0] - $t.centroid[0]) | . * .) + (($c[1] - $t.centroid[1]) | . * .)) | sqrt end)
      }] as $units
| ($units | map(.centroid_error_inches | select(. != null))) as $errors
| {
    units: $units,
    summary: {
      units: ($units | length),
      status_accuracy: (($units | map(select(.status_match)) | length) / ($units | length)),
      centroids_compared: ($errors | length),
      mean_centroid_error_inches: (if ($errors | length) == 0 then null else ($errors | mean) end),
      max_centroid_error_inches: ($errors | max),
      by_confidence: ($units | group_by(.confidence) | map({key: .[0].confidence, value: {
        units: length,
        status_accuracy: ((map(select(.status_match)) | length) / length),
        mean_centroid_error_inches: (map(.centroid_error_inches | select(. != null))
          | if length == 0 then null else mean end)}})
        | from_entries)
    }
  }
