package com.ukw.mobile;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.text.TextUtils;
import android.text.TextWatcher;
import android.text.Editable;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.inputmethod.InputMethodManager;
import android.content.Context;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import java.util.List;
import java.util.Locale;

public final class MainActivity extends Activity {
    private static final int INK = Color.rgb(24, 32, 51);
    private static final int MUTED = Color.rgb(111, 120, 139);
    private static final int PURPLE = Color.rgb(102, 87, 217);
    private static final int BG = Color.rgb(246, 247, 251);
    private static final String[] COLORS = {"#FDE68A", "#A7F3D0", "#BFDBFE", "#FBCFE8", "#DDD6FE"};

    private AnnotationDb db;
    private LinearLayout page, listContainer, colorRow;
    private ScrollView rootScroll;
    private EditText quoteInput, noteInput, tagsInput, titleInput, urlInput, searchInput;
    private TextView formHeading, countText;
    private long editingId = 0;
    private String selectedColor = COLORS[0];
    private boolean processTextMode = false;
    private String originalProcessedText = "";
    private boolean building = false;

    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        db = new AnnotationDb(this);
        buildScreen();
        handleIncoming(getIntent());
        renderList("");
    }

    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIncoming(intent);
    }

    private void buildScreen() {
        rootScroll = new ScrollView(this);
        rootScroll.setFillViewport(true);
        rootScroll.setBackgroundColor(BG);
        page = new LinearLayout(this);
        page.setOrientation(LinearLayout.VERTICAL);
        page.setPadding(dp(18), dp(16), dp(18), dp(30));
        rootScroll.addView(page);
        setContentView(rootScroll);

        LinearLayout hero = new LinearLayout(this);
        hero.setOrientation(LinearLayout.VERTICAL);
        hero.setPadding(dp(20), dp(18), dp(20), dp(18));
        hero.setBackground(round(0xFF171D32, 22));
        page.addView(hero, matchWrap());

        TextView brand = text("UKW  /  UNIVERSAL KNOWLEDGE WORKSPACE", 11, 0xFFC7C1FF, true);
        hero.addView(brand);
        TextView title = text("Keep what matters.", 25, Color.WHITE, true);
        LinearLayout.LayoutParams tp = wrap(); tp.topMargin = dp(9); hero.addView(title, tp);
        TextView subtitle = text("Capture a passage, add your thinking, find it later.", 13, 0xFFD4D8E4, false);
        LinearLayout.LayoutParams sp = wrap(); sp.topMargin = dp(5); hero.addView(subtitle, sp);

        formHeading = text("New capture", 19, INK, true);
        LinearLayout.LayoutParams fh = wrap(); fh.topMargin = dp(22); fh.bottomMargin = dp(10); page.addView(formHeading, fh);

        quoteInput = field("Selected text / passage", true);
        page.addView(quoteInput, fieldParams(116));
        noteInput = field("Your note (optional)", true);
        LinearLayout.LayoutParams np = fieldParams(88); np.topMargin = dp(10); page.addView(noteInput, np);

        TextView colorLabel = text("HIGHLIGHT COLOUR", 10, MUTED, true);
        LinearLayout.LayoutParams cl = wrap(); cl.topMargin = dp(15); cl.bottomMargin = dp(7); page.addView(colorLabel, cl);
        colorRow = new LinearLayout(this); colorRow.setOrientation(LinearLayout.HORIZONTAL); colorRow.setGravity(Gravity.CENTER_VERTICAL);
        page.addView(colorRow, matchWrap());
        renderColorChoices();

        tagsInput = field("Tags · e.g. research, idea, read-later", false);
        LinearLayout.LayoutParams tagp = fieldParams(52); tagp.topMargin = dp(12); page.addView(tagsInput, tagp);
        titleInput = field("Source title (optional)", false);
        LinearLayout.LayoutParams titp = fieldParams(52); titp.topMargin = dp(9); page.addView(titleInput, titp);
        urlInput = field("Source URL (optional)", false);
        LinearLayout.LayoutParams urlp = fieldParams(52); urlp.topMargin = dp(9); page.addView(urlInput, urlp);

        LinearLayout actions = new LinearLayout(this); actions.setOrientation(LinearLayout.HORIZONTAL); actions.setGravity(Gravity.CENTER_VERTICAL);
        LinearLayout.LayoutParams ap = matchWrap(); ap.topMargin = dp(14); page.addView(actions, ap);
        Button save = button("Save to library", PURPLE, Color.WHITE);
        actions.addView(save, new LinearLayout.LayoutParams(0, dp(50), 1));
        save.setOnClickListener(v -> saveEntry());
        Button clear = button("Clear", 0xFFE8EAF2, INK);
        LinearLayout.LayoutParams cp = new LinearLayout.LayoutParams(dp(84), dp(50)); cp.leftMargin = dp(9); actions.addView(clear, cp);
        clear.setOnClickListener(v -> resetForm());

        LinearLayout libraryHead = new LinearLayout(this); libraryHead.setOrientation(LinearLayout.HORIZONTAL); libraryHead.setGravity(Gravity.CENTER_VERTICAL);
        LinearLayout.LayoutParams lhp = matchWrap(); lhp.topMargin = dp(25); lhp.bottomMargin = dp(10); page.addView(libraryHead, lhp);
        TextView lib = text("Your library", 19, INK, true); libraryHead.addView(lib, new LinearLayout.LayoutParams(0, -2, 1));
        countText = text("0 SAVED", 10, MUTED, true); libraryHead.addView(countText);
        searchInput = field("Search saved passages, notes, tags…", false);
        page.addView(searchInput, fieldParams(48));
        searchInput.addTextChangedListener(new TextWatcher() {
            @Override public void beforeTextChanged(CharSequence s, int st, int c, int a) { }
            @Override public void onTextChanged(CharSequence s, int st, int before, int count) { renderList(s.toString()); }
            @Override public void afterTextChanged(Editable e) { }
        });
        listContainer = new LinearLayout(this); listContainer.setOrientation(LinearLayout.VERTICAL);
        LinearLayout.LayoutParams lp = matchWrap(); lp.topMargin = dp(10); page.addView(listContainer, lp);

        TextView footer = text("PRIVATE BY DEFAULT  ·  STORED ON THIS DEVICE", 9, MUTED, true);
        footer.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams fp = matchWrap(); fp.topMargin = dp(24); page.addView(footer, fp);
    }

    private void handleIncoming(Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        if (Intent.ACTION_PROCESS_TEXT.equals(action)) {
            CharSequence selected = intent.getCharSequenceExtra(Intent.EXTRA_PROCESS_TEXT);
            if (selected != null) {
                resetForm();
                processTextMode = true;
                originalProcessedText = selected.toString();
                quoteInput.setText(originalProcessedText);
                formHeading.setText("Save selected text");
                String caller = getCallingPackage();
                if (caller != null) titleInput.setText(appLabel(caller));
                quoteInput.requestFocus();
                Toast.makeText(this, "Selected text received by UKW", Toast.LENGTH_SHORT).show();
            }
        } else if (Intent.ACTION_SEND.equals(action)) {
            processTextMode = false;
            resetForm();
            CharSequence shared = intent.getCharSequenceExtra(Intent.EXTRA_TEXT);
            String subject = intent.getStringExtra(Intent.EXTRA_SUBJECT);
            String body = shared == null ? "" : shared.toString();
            if (!TextUtils.isEmpty(body)) {
                if (looksLikeUrl(body.trim())) urlInput.setText(body.trim());
                else quoteInput.setText(body);
            }
            if (!TextUtils.isEmpty(subject)) titleInput.setText(subject);
            Uri stream = intent.getParcelableExtra(Intent.EXTRA_STREAM);
            if (stream != null && TextUtils.isEmpty(urlInput.getText())) urlInput.setText(stream.toString());
            Toast.makeText(this, "Shared content received", Toast.LENGTH_SHORT).show();
        }
    }

    private String appLabel(String packageName) {
        try {
            return getPackageManager().getApplicationLabel(getPackageManager().getApplicationInfo(packageName, 0)).toString();
        } catch (Exception ignored) { return packageName; }
    }

    private void saveEntry() {
        String quote = quoteInput.getText().toString().trim();
        if (quote.isEmpty()) {
            Toast.makeText(this, "Add the text you want to save first", Toast.LENGTH_SHORT).show();
            quoteInput.requestFocus(); return;
        }
        AnnotationDb.Entry e = new AnnotationDb.Entry();
        e.id = editingId;
        e.quote = quote;
        e.note = noteInput.getText().toString().trim();
        e.color = selectedColor;
        e.tags = tagsInput.getText().toString().trim();
        e.sourceTitle = titleInput.getText().toString().trim();
        e.sourceUrl = urlInput.getText().toString().trim();
        e.sourceApp = processTextMode ? "Android text selection" : "Android share";
        long id = db.save(e);
        if (id <= 0) {
            Toast.makeText(this, "Could not save. Please try again.", Toast.LENGTH_LONG).show(); return;
        }
        hideKeyboard();
        Toast.makeText(this, editingId > 0 ? "Annotation updated" : "Saved to your UKW library", Toast.LENGTH_SHORT).show();
        if (processTextMode) {
            Intent result = new Intent();
            result.putExtra(Intent.EXTRA_PROCESS_TEXT, originalProcessedText);
            setResult(RESULT_OK, result);
            finish();
            return;
        }
        resetForm();
        renderList(searchInput == null ? "" : searchInput.getText().toString());
    }

    private void resetForm() {
        editingId = 0;
        selectedColor = COLORS[0];
        if (quoteInput != null) quoteInput.setText("");
        if (noteInput != null) noteInput.setText("");
        if (tagsInput != null) tagsInput.setText("");
        if (titleInput != null) titleInput.setText("");
        if (urlInput != null) urlInput.setText("");
        if (formHeading != null) formHeading.setText("New capture");
        processTextMode = false;
        originalProcessedText = "";
        if (colorRow != null) renderColorChoices();
    }

    private void openEntry(AnnotationDb.Entry e) {
        editingId = e.id;
        selectedColor = e.color;
        formHeading.setText("Edit annotation");
        quoteInput.setText(e.quote);
        noteInput.setText(e.note);
        tagsInput.setText(e.tags);
        titleInput.setText(e.sourceTitle);
        urlInput.setText(e.sourceUrl);
        renderColorChoices();
        rootScroll.smoothScrollTo(0, 0);
    }

    private void renderList(String query) {
        if (listContainer == null) return;
        listContainer.removeAllViews();
        List<AnnotationDb.Entry> entries = db.list(query);
        countText.setText(entries.size() + " SAVED");
        if (entries.isEmpty()) {
            LinearLayout empty = new LinearLayout(this); empty.setOrientation(LinearLayout.VERTICAL);
            empty.setPadding(dp(18), dp(22), dp(18), dp(22)); empty.setGravity(Gravity.CENTER);
            empty.setBackground(round(Color.WHITE, 16));
            TextView t = text("Your saved ideas will appear here", 14, INK, true); t.setGravity(Gravity.CENTER); empty.addView(t);
            TextView s = text("Select text in another app and choose UKW, or use Share → UKW.", 12, MUTED, false);
            s.setGravity(Gravity.CENTER); LinearLayout.LayoutParams ep = wrap(); ep.topMargin = dp(6); empty.addView(s, ep);
            listContainer.addView(empty, matchWrap()); return;
        }
        for (AnnotationDb.Entry e : entries) {
            LinearLayout card = new LinearLayout(this); card.setOrientation(LinearLayout.VERTICAL);
            card.setPadding(dp(15), dp(13), dp(13), dp(13));
            GradientDrawable bg = round(Color.WHITE, 16); bg.setStroke(dp(1), 0xFFE9EAF1); card.setBackground(bg);
            LinearLayout.LayoutParams cardp = matchWrap(); cardp.bottomMargin = dp(9); listContainer.addView(card, cardp);
            View stripe = new View(this); stripe.setBackground(round(parseColor(e.color), 4));
            card.addView(stripe, new LinearLayout.LayoutParams(dp(34), dp(5)));
            TextView q = text(e.quote, 14, INK, true); q.setMaxLines(4); q.setEllipsize(TextUtils.TruncateAt.END);
            LinearLayout.LayoutParams qp = wrap(); qp.topMargin = dp(9); card.addView(q, qp);
            if (!TextUtils.isEmpty(e.note)) {
                TextView n = text(e.note, 12, MUTED, false); n.setMaxLines(3); n.setEllipsize(TextUtils.TruncateAt.END);
                LinearLayout.LayoutParams nlp = wrap(); nlp.topMargin = dp(6); card.addView(n, nlp);
            }
            String meta = e.sourceTitle;
            if (!TextUtils.isEmpty(e.tags)) meta += (meta.isEmpty() ? "" : "  ·  ") + "#" + e.tags.replace(",", "  #");
            if (!TextUtils.isEmpty(meta)) {
                TextView m = text(meta, 10, MUTED, false); m.setMaxLines(1); m.setEllipsize(TextUtils.TruncateAt.END);
                LinearLayout.LayoutParams mp = wrap(); mp.topMargin = dp(9); card.addView(m, mp);
            }
            LinearLayout row = new LinearLayout(this); row.setOrientation(LinearLayout.HORIZONTAL); row.setGravity(Gravity.CENTER_VERTICAL);
            LinearLayout.LayoutParams rp = matchWrap(); rp.topMargin = dp(10); card.addView(row, rp);
            TextView date = text(android.text.format.DateFormat.format("dd MMM yyyy", e.updatedAt).toString(), 10, MUTED, false);
            row.addView(date, new LinearLayout.LayoutParams(0, -2, 1));
            Button edit = smallButton("Edit", 0xFFEDEBFF, PURPLE); row.addView(edit); edit.setOnClickListener(v -> openEntry(e));
            Button del = smallButton("Delete", 0xFFFFEEEE, 0xFFB42318);
            LinearLayout.LayoutParams dp = new LinearLayout.LayoutParams(-2, dp(34)); dp.leftMargin = dp(6); row.addView(del, dp);
            del.setOnClickListener(v -> { db.delete(e.id); if (editingId == e.id) resetForm(); renderList(query); Toast.makeText(this, "Deleted", Toast.LENGTH_SHORT).show(); });
            card.setOnClickListener(v -> openEntry(e));
        }
    }

    private void renderColorChoices() {
        colorRow.removeAllViews();
        for (String color : COLORS) {
            TextView swatch = new TextView(this);
            swatch.setGravity(Gravity.CENTER);
            swatch.setText(color.equals(selectedColor) ? "✓" : "");
            swatch.setTextColor(0xFF343047); swatch.setTextSize(15); swatch.setTypeface(null, Typeface.BOLD);
            swatch.setBackground(round(parseColor(color), 30));
            LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(dp(37), dp(37)); p.rightMargin = dp(9);
            colorRow.addView(swatch, p);
            swatch.setOnClickListener(v -> { selectedColor = color; renderColorChoices(); });
        }
    }

    private EditText field(String hint, boolean multiline) {
        EditText e = new EditText(this);
        e.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14); e.setTextColor(INK); e.setHintTextColor(0xFF9299AA);
        e.setHint(hint); e.setSingleLine(!multiline); e.setPadding(dp(13), dp(10), dp(13), dp(10));
        e.setBackground(round(Color.WHITE, 13));
        if (multiline) { e.setGravity(Gravity.TOP | Gravity.START); e.setInputType(0x00020001 | 0x00008000); }
        else e.setInputType(0x00000001 | 0x00008000);
        return e;
    }

    private Button button(String label, int background, int foreground) {
        Button b = new Button(this); b.setText(label); b.setAllCaps(false); b.setTextSize(14);
        b.setTypeface(null, Typeface.BOLD); b.setTextColor(foreground); b.setBackground(round(background, 14));
        b.setPadding(dp(10), 0, dp(10), 0); return b;
    }
    private Button smallButton(String label, int background, int foreground) {
        Button b = button(label, background, foreground); b.setTextSize(11); b.setMinHeight(0); b.setMinimumHeight(0);
        b.setMinWidth(0); b.setMinimumWidth(0); b.setPadding(dp(10), 0, dp(10), 0);
        b.setLayoutParams(new LinearLayout.LayoutParams(-2, dp(34))); return b;
    }
    private TextView text(String value, int size, int color, boolean bold) {
        TextView t = new TextView(this); t.setText(value); t.setTextSize(TypedValue.COMPLEX_UNIT_SP, size);
        t.setTextColor(color); if (bold) t.setTypeface(null, Typeface.BOLD); return t;
    }
    private GradientDrawable round(int color, int radius) {
        GradientDrawable d = new GradientDrawable(); d.setColor(color); d.setCornerRadius(dp(radius)); return d;
    }
    private int parseColor(String value) { try { return Color.parseColor(value); } catch (Exception e) { return Color.LTGRAY; } }
    private int dp(int value) { return (int) (value * getResources().getDisplayMetrics().density + 0.5f); }
    private LinearLayout.LayoutParams matchWrap() { return new LinearLayout.LayoutParams(-1, -2); }
    private LinearLayout.LayoutParams wrap() { return new LinearLayout.LayoutParams(-2, -2); }
    private LinearLayout.LayoutParams fieldParams(int height) { return new LinearLayout.LayoutParams(-1, dp(height)); }
    private boolean looksLikeUrl(String s) { return s.matches("(?i)^(https?://|www\\.).+"); }
    private void hideKeyboard() {
        try { ((InputMethodManager) getSystemService(Context.INPUT_METHOD_SERVICE)).hideSoftInputFromWindow(quoteInput.getWindowToken(), 0); }
        catch (Exception ignored) { }
    }
}
