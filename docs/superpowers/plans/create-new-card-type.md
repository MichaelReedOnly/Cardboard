# Create New Card Type

Use this plan when asked to **create new card type**. Apply it to one Cardboard type at a time. Post-it is the existing example of a type with its own editor controls and saved fields.

## 1. Define the card

- [ ] Record the display name, a stable type ID such as `habit-tracker`, and what the card helps the user do.
- [ ] Identify what appears on the board and what can be edited. Use a screenshot and representative JSON when available. Include an example of an empty card and a filled card.
- [ ] List the fields, allowed values, defaults, and required fields. Reuse the existing title, body, project, date, pin status, and checklist items wherever they fit. Define how switching to or from another type affects its data.

## 2. Update the model and backup format

- [ ] In `src/model.js`, admit the new ID in `validateState`. Validate any type-specific fields and give optional fields safe defaults in the editor and renderer. Keep existing backups readable.
- [ ] Save through the existing repository in `src/storage.js`. Check that export and import preserve the new fields. Invalid imports should leave the existing board intact.
- [ ] If the input comes from another site, compare it with a local export. Map external type names and fields to Cardboard's format before import. Check that board, project, and card references still resolve. Record any fields that cannot be mapped.

## 3. Build the editor and board display

- [ ] In `src/app.js`, add the display name to the **Card type** picker in `openEditor`. Show controls for the selected type, initialize them from the saved card or defaults, and include their values in **Save card**. Check that Cancel discards unsaved edits.
- [ ] In `renderCard`, put the type-specific content inside the existing card shell. Use text nodes for user text and validate any URLs or named style values before use. Keep project filtering, pinning, search, and drag and drop available through the existing board controls.
- [ ] In `src/styles.css`, match the reference while honoring the board's text-size setting. Let long content wrap and grow in narrow columns. If the card has a substantially different height, check whether `balanceColumns` in `src/model.js` needs an updated height estimate.

## 4. Verify and hand off

- [ ] Add targeted tests for new field validation and backup round trips. Include a valid example, omitted optional fields, and invalid data.
- [ ] Run `npm test` and `npm run check`.
- [ ] In a browser, create the card, edit it, reload, and verify its content. Check the empty and long-content states, keyboard operation, a narrow layout, and moving the card between columns. Report any checks you could not run.

When requesting a new card type, supply its name, intended behavior, and any sample JSON or screenshot. Use the steps above to translate those inputs into a Cardboard implementation.
