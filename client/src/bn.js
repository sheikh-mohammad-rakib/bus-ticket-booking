// Bangla names for the seeded cities — displayed in headline positions,
// the way bus boards and tickets in Bangladesh show them first.
const BN = {
  Dhaka: "ঢাকা",
  Chattogram: "চট্টগ্রাম",
  Sylhet: "সিলেট",
  Khulna: "খুলনা",
  Rajshahi: "রাজশাহী",
  Barishal: "বরিশাল",
  "Cox's Bazar": "কক্সবাজার",
  Rangpur: "রংপুর",
  Cumilla: "কুমিল্লা",
  Mymensingh: "ময়মনসিংহ",
};

export const bnCity = (name) => BN[name] || name;
