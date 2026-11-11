package com.ukw.mobile;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;

import java.util.ArrayList;
import java.util.List;

final class AnnotationDb extends SQLiteOpenHelper {
    private static final String DB_NAME = "ukw_local.db";
    private static final int DB_VERSION = 1;

    AnnotationDb(Context context) { super(context, DB_NAME, null, DB_VERSION); }

    @Override public void onCreate(SQLiteDatabase db) {
        db.execSQL("CREATE TABLE annotations (" +
                "id INTEGER PRIMARY KEY AUTOINCREMENT," +
                "quote TEXT NOT NULL," +
                "note TEXT NOT NULL DEFAULT ''," +
                "color TEXT NOT NULL DEFAULT '#FDE68A'," +
                "tags TEXT NOT NULL DEFAULT ''," +
                "source_title TEXT NOT NULL DEFAULT ''," +
                "source_url TEXT NOT NULL DEFAULT ''," +
                "source_app TEXT NOT NULL DEFAULT ''," +
                "created_at INTEGER NOT NULL," +
                "updated_at INTEGER NOT NULL)");
        db.execSQL("CREATE INDEX idx_annotations_updated ON annotations(updated_at DESC)");
    }

    @Override public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) { }

    long save(Entry e) {
        SQLiteDatabase db = getWritableDatabase();
        long now = System.currentTimeMillis();
        ContentValues v = new ContentValues();
        v.put("quote", e.quote); v.put("note", e.note); v.put("color", e.color);
        v.put("tags", e.tags); v.put("source_title", e.sourceTitle); v.put("source_url", e.sourceUrl);
        v.put("source_app", e.sourceApp); v.put("updated_at", now);
        if (e.id > 0) {
            db.update("annotations", v, "id=?", new String[]{String.valueOf(e.id)});
            return e.id;
        }
        v.put("created_at", now);
        return db.insert("annotations", null, v);
    }

    List<Entry> list(String query) {
        ArrayList<Entry> out = new ArrayList<>();
        SQLiteDatabase db = getReadableDatabase();
        String q = query == null ? "" : query.trim();
        Cursor c;
        if (q.isEmpty()) {
            c = db.rawQuery("SELECT * FROM annotations ORDER BY updated_at DESC", null);
        } else {
            String like = "%" + q + "%";
            c = db.rawQuery("SELECT * FROM annotations WHERE quote LIKE ? OR note LIKE ? OR tags LIKE ? OR source_title LIKE ? ORDER BY updated_at DESC",
                    new String[]{like, like, like, like});
        }
        try {
            while (c.moveToNext()) {
                Entry e = new Entry();
                e.id = c.getLong(c.getColumnIndexOrThrow("id"));
                e.quote = c.getString(c.getColumnIndexOrThrow("quote"));
                e.note = c.getString(c.getColumnIndexOrThrow("note"));
                e.color = c.getString(c.getColumnIndexOrThrow("color"));
                e.tags = c.getString(c.getColumnIndexOrThrow("tags"));
                e.sourceTitle = c.getString(c.getColumnIndexOrThrow("source_title"));
                e.sourceUrl = c.getString(c.getColumnIndexOrThrow("source_url"));
                e.sourceApp = c.getString(c.getColumnIndexOrThrow("source_app"));
                e.createdAt = c.getLong(c.getColumnIndexOrThrow("created_at"));
                e.updatedAt = c.getLong(c.getColumnIndexOrThrow("updated_at"));
                out.add(e);
            }
        } finally { c.close(); }
        return out;
    }

    void delete(long id) { getWritableDatabase().delete("annotations", "id=?", new String[]{String.valueOf(id)}); }

    static final class Entry {
        long id = 0, createdAt = 0, updatedAt = 0;
        String quote = "", note = "", color = "#FDE68A", tags = "";
        String sourceTitle = "", sourceUrl = "", sourceApp = "";
    }
}
