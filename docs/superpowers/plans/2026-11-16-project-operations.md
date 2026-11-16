# Projects operations and behavior

Revised for final review. Use the project row and card editor for project operations.

## Implementation

1. Move projects from board ownership to a shared catalog. Keep stable project IDs and one nullable project ID per card. Enforce unique names across the catalog after trimming and comparing case-insensitively. Migrate older backups by preserving IDs and layouts and adding a suffix to conflicting names. Preserve assignments except for To-do cards. Clear any legacy To-do assignments during migration and enforce No project for To-do cards in the editor and model.
2. Store one system-assigned color per project across the catalog. Assign colors once, including for migrated projects. Use the same value for the project button dot and the assigned card's icon background. To-do cards retain their compact appearance.
3. Render the shared projects as oval buttons in alphabetical order between the top controls and the board, with No project and New project at the end. Each board shows its own cards. Each button toggles independently and exposes its selected state to keyboard and screen-reader users. Use the union of selected projects and include unassigned cards when No project is selected. Start in All and provide a reset to All. An active selection with every toggle off shows no cards. Combine project selection with search and date filtering. Apply filters after laying out the board so saved card positions remain stable.
4. Put New project in the project row and add the same action to the card editor's Project picker. Creating from the row starts an empty project. In the editor, make the new project available for assignment when the card is saved. Surface Rename and Delete through the project's options in the same row. Keep card assignment in the editor, including No project.
5. Save renames and deletions through the existing repository. Renames preserve the project ID and assignments across boards. Before deletion, show the total affected card count across all boards. On confirmation, preserve the cards and move them to No project in the same save. Clear deleted IDs from filters.
6. Verify shared projects across boards, system-wide duplicate-name rejection, empty project creation, assignment and unassignment, To-do restrictions, stable colors and ordering, multiple project toggles, All and empty states, search and date combinations, cross-board rename and deletion, and backup round trips. Test migration of old backups and save failures alongside browser checks.

Project filter selections are temporary for the active view. Project names, colors, and assignments are saved.
