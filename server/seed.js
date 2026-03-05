import db from "./db.js";

console.log("🌱 Seeding database...\n");

// ── Lessons data (matches the frontend LESSONS array) ──
const LESSONS = [
  {
    slug: "greetings", title: "Nkyia", subtitle: "Greetings", icon: "👋",
    color: "#FFD233", difficulty: 1, world: "Village Square",
    bgGrad: "linear-gradient(135deg, #1a3a5c 0%, #0d2137 100%)",
    phrases: [
      { twi: "Maakye", phonetic: "maa-chi", english: "Good morning", emoji: "🌅", context: "When the sun wakes up!" },
      { twi: "Maaha", phonetic: "maa-ha", english: "Good afternoon", emoji: "☀️", context: "When the sun is high!" },
      { twi: "Maadwo", phonetic: "maa-jo", english: "Good evening", emoji: "🌙", context: "When stars come out!" },
      { twi: "Medaase", phonetic: "meh-daa-seh", english: "Thank you", emoji: "🙏", context: "Being grateful!" },
    ],
  },
  {
    slug: "family", title: "Abusua", subtitle: "Family", icon: "🏠",
    color: "#FF6B6B", difficulty: 1, world: "Home Sweet Home",
    bgGrad: "linear-gradient(135deg, #5c1a2a 0%, #371320 100%)",
    phrases: [
      { twi: "Maame", phonetic: "maa-meh", english: "Mother", emoji: "👩🏿", context: "The queen of the house!" },
      { twi: "Papa", phonetic: "pah-pah", english: "Father", emoji: "👨🏿", context: "The king of the house!" },
      { twi: "Nana", phonetic: "nah-nah", english: "Grandparent", emoji: "👴🏿", context: "The wisest of all!" },
    ],
  },
  {
    slug: "numbers", title: "Nkonta", subtitle: "Numbers", icon: "✨",
    color: "#4FC3F7", difficulty: 2, world: "Counting Garden",
    bgGrad: "linear-gradient(135deg, #1a3d5c 0%, #0d2840 100%)",
    phrases: [
      { twi: "Baako", phonetic: "baa-ko", english: "One", emoji: "☝️", context: "Just one finger!" },
      { twi: "Mmienu", phonetic: "mien-u", english: "Two", emoji: "✌️", context: "A pair, like your eyes!" },
      { twi: "Mmiɛnsa", phonetic: "mien-sa", english: "Three", emoji: "🤟", context: "Three little birds!" },
    ],
  },
  {
    slug: "animals", title: "Mmoa", subtitle: "Animals", icon: "🦁",
    color: "#66E0A3", difficulty: 2, world: "Safari Trail",
    bgGrad: "linear-gradient(135deg, #1a4a3a 0%, #0d2a20 100%)",
    phrases: [
      { twi: "Akoko", phonetic: "ah-ko-ko", english: "Chicken", emoji: "🐔", context: "Cock-a-doodle-doo!" },
      { twi: "Gyata", phonetic: "ja-ta", english: "Lion", emoji: "🦁", context: "The brave king!" },
      { twi: "Ɛsono", phonetic: "eh-so-no", english: "Elephant", emoji: "🐘", context: "Big and gentle!" },
    ],
  },
  {
    slug: "food", title: "Aduane", subtitle: "Food", icon: "🍲",
    color: "#FF8C42", difficulty: 3, world: "Kitchen Kingdom",
    bgGrad: "linear-gradient(135deg, #5c3a1a 0%, #3a2010 100%)",
    phrases: [
      { twi: "Nsuo", phonetic: "en-suo", english: "Water", emoji: "💧", context: "Splish splash!" },
      { twi: "Ɛkɔm de me", phonetic: "eh-kom-deh-meh", english: "I am hungry", emoji: "😋", context: "Tummy rumbles!" },
      { twi: "Nkwan", phonetic: "en-kwan", english: "Soup", emoji: "🍲", context: "Yummy in my tummy!" },
    ],
  },
];

// ── Clear existing data ──
db.exec("DELETE FROM phrases");
db.exec("DELETE FROM lessons");
console.log("  ✓ Cleared existing lesson data");

// ── Insert lessons and phrases ──
const insertLesson = db.prepare(`
  INSERT INTO lessons (slug, title, subtitle, icon, color, difficulty, world, bg_grad, sort_order)
  VALUES (@slug, @title, @subtitle, @icon, @color, @difficulty, @world, @bgGrad, @sortOrder)
`);

const insertPhrase = db.prepare(`
  INSERT INTO phrases (lesson_id, twi, phonetic, english, emoji, context, sort_order)
  VALUES (@lessonId, @twi, @phonetic, @english, @emoji, @context, @sortOrder)
`);

const seedAll = db.transaction(() => {
  LESSONS.forEach((lesson, lessonIdx) => {
    const result = insertLesson.run({
      slug: lesson.slug,
      title: lesson.title,
      subtitle: lesson.subtitle,
      icon: lesson.icon,
      color: lesson.color,
      difficulty: lesson.difficulty,
      world: lesson.world,
      bgGrad: lesson.bgGrad,
      sortOrder: lessonIdx,
    });

    const lessonId = result.lastInsertRowid;

    lesson.phrases.forEach((phrase, phraseIdx) => {
      insertPhrase.run({
        lessonId,
        twi: phrase.twi,
        phonetic: phrase.phonetic,
        english: phrase.english,
        emoji: phrase.emoji,
        context: phrase.context,
        sortOrder: phraseIdx,
      });
    });

    console.log(`  ✓ ${lesson.title} (${lesson.subtitle}) — ${lesson.phrases.length} phrases`);
  });
});

seedAll();

const lessonCount = db.prepare("SELECT COUNT(*) as count FROM lessons").get().count;
const phraseCount = db.prepare("SELECT COUNT(*) as count FROM phrases").get().count;

console.log(`\n✅ Seeded ${lessonCount} lessons with ${phraseCount} phrases!`);
process.exit(0);
