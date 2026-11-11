# UKW Android APK তৈরি ও ফোনে ইনস্টল করার নিয়ম

এই ZIP-এ UKW-এর মূল source code-এর সঙ্গে নতুন native Android project যোগ করা হয়েছে। এখানে সরাসরি APK binary নেই; GitHub Actions দিয়ে APK build করতে হবে।

## GitHub থেকে APK তৈরি

1. ZIP extract করো। ভিতরে `universal-knowledge-workspace` নামে project folder থাকবে।
2. GitHub-এ একটি repository তৈরি করো (অথবা নিজের existing UKW source repository ব্যবহার করো)।
3. Project folder-এর **ভিতরের সব ফাইল ও folder** repository-র root-এ upload করো। বিশেষ করে `.github/workflows/android-apk.yml` ফাইলটি যেন থাকে।
4. GitHub repository-তে **Actions** tab খুলে `Build UKW Android APK` workflow নির্বাচন করো।
5. **Run workflow → Run workflow** চাপো।
6. Build শেষ হলে সফল run খুলে নিচের **Artifacts** অংশ থেকে `ukw-android-apk` download করো।
7. Download ZIP extract করলে `app-release.apk` পাবে। ফোনে পাঠিয়ে install করো।

## ফোনে কীভাবে ব্যবহার করবে

- কোনো অ্যাপে text select করে Android selection menu-তে **UKW** থাকলে সেটি চাপো। Quote UKW-তে চলে আসবে। Note, colour ও tags দিয়ে **Save to library** চাপো।
- UKW selection menu-তে না থাকলে ওই অ্যাপের **Share → UKW** ব্যবহার করো।
- UKW খুলে নিচের library থেকে saved item search, edit বা delete করতে পারবে।

## গুরুত্বপূর্ণ সীমাবদ্ধতা

- এই প্রথম APK-তে data ফোনের ভেতরের SQLite database-এ থাকবে।
- Laptop/Chrome Extension-এর সঙ্গে Live Sync এখনো যুক্ত হয়নি।
- Facebook/Chrome/PDF reader-এর ভেতরে স্থায়ীভাবে highlight আঁকা সম্ভব বলে দাবি করা হচ্ছে না; UKW selected text ও annotation নিজের library-তে রাখে।
- কিছু অ্যাপ Android text-selection action দেখায় না; সেসব ক্ষেত্রে Share ব্যবহার করতে হবে।
- APK build হওয়ার পরও নিজের Android ফোনে manual test করতে হবে। Test list: `android/ANDROID-TEST-CHECKLIST.md`।
