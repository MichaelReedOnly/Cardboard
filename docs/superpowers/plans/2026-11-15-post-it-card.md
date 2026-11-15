# Post-it card implementation plan

**Goal** — Add Post-it as a fifth card type with a colored writing surface, eight color choices, and left or center alignment.

**Proposed design** — Default to amber and left alignment. Use the existing Save card flow. Keep the date, project, and pin controls. The board tile shows the colored note. Opening it reveals the editor and styling controls shown in the reference.

1. **Define the saved card.** Add `post-it` to the allowed types in `src/model.js`. Reuse `body` for text and store `postItColor` and `postItAlignment` as named values. Share the palette between editor and renderer. Validate values in the model, apply defaults when fields are absent, and use the existing repository and JSON backup format. Confirm older backups still open.
2. **Build the editor.** Add **Post-it** to the card-type picker in `src/app.js`. Render a colored writing surface with an expanding textarea. Add swatches in reference order: amber, magenta, cobalt, lime, purple, red, green, slate. Add Left and Center buttons. Update the preview from the current form values and save text, color, and alignment together. Use accessible names, pressed states, and a visible selection ring on swatches.
3. **Render the board tile.** Show the body as plain text on the selected color. Make the surface at least square, vertically center short text, and let longer text wrap and grow the surface. Use the board’s saved text size for the active column count. Keep the existing card shell and drag handlers. Account for Post-it height in automatic placement for layouts without saved positions.
4. **Verify.** Test validation and backup round trips for the new fields. In the browser, create and edit a lime note, switch alignment, save, and reload. Check that long notes remain visible in narrow columns, keyboard controls work, project filtering finds the card, and card swapping and bottom drops still work.

**Reference details** — Use the supplied palette and note layout. The source has an unlabeled bottom plus whose behavior is unspecified. The initial scope covers the writing surface, color and alignment controls, and existing Cardboard actions.
