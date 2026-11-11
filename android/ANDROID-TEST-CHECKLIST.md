# Android manual test checklist

- [ ] Install the release APK on Android 6.0+.
- [ ] Open UKW directly; confirm the capture form and empty-library state render.
- [ ] Select a paragraph in Chrome or another text app → More → UKW; confirm the quote is prefilled.
- [ ] Add a note, choose a colour, add tags, save; confirm it returns to the source app.
- [ ] Open UKW again; confirm the saved entry remains after process/app restart.
- [ ] Edit the entry; confirm quote, note, colour, tags and source fields persist.
- [ ] Search by a word in the quote, note and tags.
- [ ] Delete an entry; confirm it disappears.
- [ ] In another app, Share → UKW; confirm shared text is prefilled and can be saved.
- [ ] Test long text, Bangla text, emoji, rotation and keyboard behaviour.
- [ ] Test selection integration in at least Chrome, Facebook and a PDF reader; record apps where the Android selection action is absent.

Do not mark Android release verification complete until these checks have been run on a physical phone.
