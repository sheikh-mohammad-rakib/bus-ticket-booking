// The Bangla half of the English ⇄ বাংলা toggle.
// DICT maps the app's English UI copy (the key) to its Bangla rendering —
// t() returns the key itself in English mode, so nothing can go blank.
const BANGUN = "০১২৩৪৫৬৭৮৯";

// Latin digits → Bengali numerals (৳১,২৫০ style, so numbers read natively)
export const bnDigits = (s) => String(s).replace(/\d/g, (d) => BANGUN[+d]);

// Bangla names for the seeded cities — displayed in headline positions,
// the way bus boards and tickets in Bangladesh show them first.
const BN_CITIES = {
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

export const bnCity = (name) => BN_CITIES[name] || name;

const BN_DAYS = ["রবি", "সোম", "মঙ্গল", "বুধ", "বৃহঃ", "শুক্র", "শনি"];
const BN_MONTHS = [
  "জানুয়ারি", "ফেব্রুয়ারি", "মার্চ", "এপ্রিল", "মে", "জুন",
  "জুলাই", "আগস্ট", "সেপ্টেম্বর", "অক্টোবর", "নভেম্বর", "ডিসেম্বর",
];
export { BN_DAYS, BN_MONTHS };

// ---------- UI copy: "English string" → বাংলা ----------
export const DICT = {
  // Header + chrome
  "Search buses": "বাস খুঁজুন",
  "My trips": "আমার যাত্রা",
  Admin: "অ্যাডমিন",
  "Sign in": "সাইন ইন",
  "Sign out": "সাইন আউট",
  counter: "কাউন্টার",
  owner: "মালিক",
  // Stepper
  Seats: "আসন",
  Seat: "আসন",
  Passengers: "যাত্রী",
  Payment: "পেমেন্ট",
  Ticket: "টিকিট",
  "Booking progress": "বুকিংয়ের ধাপ",
  // 404 + footer
  "Page not found": "পাতাটি পাওয়া যায়নি",
  "The page you're looking for doesn't exist. It may have moved, or the link might be wrong.":
    "আপনি যে পাতাটি খুঁজছেন সেটি নেই। সম্ভবত পাতাটি সরে গেছে, বা লিংকটিই ভুল।",
  "Back to home": "হোমে ফিরুন",
  "Riders — a demo bus booking app. Payments are simulated; no card is charged.":
    "Riders — একটি ডেমো বাস টিকিট অ্যাপ। পেমেন্ট সিমুলেট করা হয়; কোনো কার্ড চার্জ করা হয় না।",
  // Home
  "Night coaches, window seats, all across Bangladesh":
    "রাতের কোচ, জানালার সিট — সারা বাংলাদেশ",
  From: "কোথা থেকে",
  To: "কোথায়",
  On: "তারিখ",
  "Travel date": "যাত্রার তারিখ",
  "Swap cities": "শহর অদল-বদল",
  "Looking…": "খোঁজা হচ্ছে…",
  "Find buses": "বাস খুঁজুন",
  "Pick two different cities.": "ভিন্ন দুটি শহর বাছুন।",
  Today: "আজ",
  Tomorrow: "আগামীকাল",
  "{n} of {m} seats free": "{m} আসনের মধ্যে {n} টি খালি",
  "Sold out": "সিট শেষ",
  "Choose seats": "আসন বাছুন",
  Unavailable: "পাওয়া যাচ্ছে না",
  "No buses run this route on {date}. Try another day or city.":
    "{date} তারিখে এই রুটে কোনো বাস চলে না। অন্য দিন বা শহর দেখুন।",
  "Popular right now: {pair}. Pick a route above.":
    "এই মুহূর্তে জনপ্রিয়: {pair}। উপরে রুট বেছে নিন।",
  // Seat map
  "No travel date chosen": "যাত্রার তারিখ বেছে নেওয়া হয়নি",
  "Loading the bus…": "বাস লোড হচ্ছে…",
  "Back to search": "সার্চে ফিরুন",
  "Back to results": "ফলাফলে ফিরুন",
  Front: "সামনে",
  "Seat map": "আসনের নকশা",
  "Seat {seat}": "আসন {seat}",
  "Seat {seat} (taken)": "আসন {seat} (ব্যস্ত)",
  Free: "খালি",
  Yours: "আপনার",
  Taken: "ব্যস্ত",
  Date: "তারিখ",
  Departs: "ছাড়ে",
  "On board": "যাত্রাকাল",
  "Fare each": "ভাড়া (জনপ্রতি)",
  Total: "সর্বমোট",
  "Up to {n} seats per booking.": "এক বুকিংয়ে সর্বোচ্চ {n} টি আসন।",
  "Continue to passengers": "যাত্রীদের তথ্য দিন",
  // Passengers / booking
  "Pick seats first.": "আগে আসন বাছুন।",
  "Who's riding?": "কারা যাচ্ছেন?",
  Contact: "যোগাযোগ",
  Name: "নাম",
  Email: "ইমেইল",
  Phone: "ফোন",
  "Card number": "কার্ড নম্বর",
  Expiry: "মেয়াদ",
  CVV: "সিভিভি",
  "Full name": "পুরো নাম",
  "Who should we call": "যোগাযোগের নাম",
  "Demo checkout — no real charge. Try {card}; cards ending {suffix} are declined.":
    "ডেমো চেকআউট — বাস্তব কোনো চার্জ নয়। ব্যবহার করুন {card}; {suffix} দিয়ে শেষ হওয়া কার্ড বাতিল ধরা হয়।",
  "Paying…": "পেমেন্ট হচ্ছে…",
  "Pay {amount}": "{amount} পরিশোধ করুন",
  "Cancel booking": "বুকিং বাতিল",
  // Ticket
  "Loading ticket…": "টিকিট লোড হচ্ছে…",
  "You're booked!": "আপনার বুকিং সম্পন্ন!",
  "Booking cancelled": "বুকিং বাতিল হয়েছে",
  "Show this ticket to the staff before boarding.":
    "চড়ার আগে এই টিকিটটি কর্মীকে দেখান।",
  "Booking code": "বুকিং কোড",
  Cancelled: "বাতিল",
  Confirmed: "নিশ্চিত",
  Paid: "পরিশোধিত",
  Refunded: "ফেরত",
  "Cancellation fee": "বাতিলের ফি",
  "Print ticket": "টিকিট প্রিন্ট",
  "Print receipt": "রসিদ প্রিন্ট",
  "Book another ride": "আরও একটি যাত্রা বুক করুন",
  "Look up by email": "ইমেইল দিয়ে খুঁজুন",
  "Cancel booking?": "বুকিং বাতিল করবেন?",
  "You paid": "আপনি পরিশোধ করেছেন",
  "Goes back to your card": "কার্ডে ফেরত যাবে",
  "Fee is 10% of the ticket value, minimum ৳50. The refund returns to the same card in 5–7 working days.":
    "ফি টিকিট মূল্যের ১০%, সর্বনিম্ন ৳৫০। ফেরত একই কার্ডে জমা হয় ৫–৭ কর্মদিবসের মধ্যে।",
  "All seats go back on sale immediately.": "সব আসন সঙ্গে সঙ্গে আবার বিক্রির জন্য খুলে যাবে।",
  "The seat goes back on sale immediately.": "আসনটি সঙ্গে সঙ্গে আবার বিক্রির জন্য খুলে যাবে।",
  "Keep my ticket": "টিকিট রেখে দিন",
  "Cancelling…": "বাতিল হচ্ছে…",
  "Cancel booking · lose {fee}": "বুকিং বাতিল · কাটা যাবে {fee}",
  // My trips
  "Signed in as {email} — showing your bookings.":
    "{email} হিসেবে লগইন — আপনার সব বুকিং দেখানো হচ্ছে।",
  "Guest tickets: enter the email you booked with.":
    "গেস্ট টিকিট: যে ইমেইল দিয়ে বুকিং করেছেন, দিন সেটি।",
  "to see all your tickets here, every time.":
    "করলে আপনার সব টিকিট এখানেই, বারবার দেখতে পাবেন।",
  "Find bookings": "বুকিং খুঁজুন",
  "No bookings on your account yet.": "আপনার অ্যাকাউন্টে এখনো কোনো বুকিং নেই।",
  "Search a route": "রুট খুঁজে নিন",
  "to get your first ticket.": "— আপনার প্রথম টিকিটটি নেওয়ার জন্য।",
  "No bookings with {email} yet.": "{email} দিয়ে এখনো কোনো বুকিং নেই।",
  "View ticket": "টিকিট দেখুন",
  // Auth
  "Assalamu alaikum again": "আবারও আসসালামু আলাইকুম",
  "Join Riders": "Riders-এ যোগ দিন",
  "Sign in to track bookings and cancel from your dashboard.":
    "বুকিং ট্র্যাক করতে ও ড্যাশবোর্ড থেকে বাতিল করতে সাইন ইন করুন।",
  "One account for all your bus tickets across Bangladesh.":
    "সারা বাংলাদেশের বাস টিকিটের জন্য একটিই অ্যাকাউন্ট।",
  "Create account": "অ্যাকাউন্ট খুলুন",
  Password: "পাসওয়ার্ড",
  "At least 8 characters. Stored salted and bcrypt-hashed.":
    "কমপক্ষে ৮ অক্ষর। সল্ট করে bcrypt-এ হ্যাশ করে রাখা হয়।",
  "Working…": "কাজ চলছে…",
  // Admin — gate + console
  "Operator console": "কাউন্টার কনসোল",
  "Owner console": "মালিক কনসোল",
  "Counter console": "কাউন্টার কনসোল",
  "Operator access only. Sign in with the operator password.":
    "শুধু কর্মীদের জন্য। অপারেটর পাসওয়ার্ড দিয়ে সাইন ইন করুন।",
  "Operator password": "অপারেটর পাসওয়ার্ড",
  "Signing in…": "সাইন ইন হচ্ছে…",
  "Live figures from the bookings ledger.": "বুকিং খাতা থেকে সরাসরি হিসাব।",
  "Lookup, check-in and cancellations at the counter. Financials are visible to the owner only.":
    "কাউন্টারে খুঁজা, চেক-ইন ও বাতিল। আর্থিক হিসাব শুধু মালিক দেখতে পারেন।",
  // Stat cards
  "Bookings today": "আজকের বুকিং",
  "Seats sold": "বিক্রি হওয়া আসন",
  Revenue: "আয়",
  Cancellations: "বাতিল",
  "{n} confirmed": "{n} টি নিশ্চিত",
  "fees {a} · refunds {b}": "ফি {a} · ফেরত {b}",
  "Best-selling routes": "সবচেয়ে বিক্রি হওয়া রুট",
  "{n} seats": "{n} আসন",
  // Staff panel
  Staff: "কর্মী",
  "Counter operators can look up bookings, check in passengers and cancel tickets. Disabled accounts lose access immediately.":
    "কাউন্টার অপারেটররা বুকিং খুঁজতে, যাত্রী চেক-ইন করতে ও টিকিট বাতিল করতে পারেন। অচল অ্যাকাউন্ট সঙ্গে সঙ্গে প্রবেশাধিকার হারায়।",
  "No staff accounts yet.": "এখনো কোনো কর্মী অ্যাকাউন্ট নেই।",
  Role: "ভূমিকা",
  Joined: "যোগদান",
  Status: "অবস্থা",
  active: "চালু",
  disabled: "অচল",
  Disable: "অচল করুন",
  Enable: "চালু করুন",
  Remove: "সরান",
  Edit: "সম্পাদনা",
  Save: "সংরক্ষণ",
  Cancel: "বাতিল",
  "You cannot remove your own account": "নিজের অ্যাকাউন্ট সরানো যাবে না",
  "Remove account": "অ্যাকাউন্ট সরান",
  "work email": "কাজের ইমেইল",
  "Password (min 8 chars)": "পাসওয়ার্ড (কমপক্ষে ৮ অক্ষর)",
  "Adding…": "যোগ হচ্ছে…",
  "Add counter operator": "কাউন্টার অপারেটর যোগ করুন",
  "Created account for {name} ({email}).": "{name} ({email})-এর জন্য অ্যাকাউন্ট তৈরি হয়েছে।",
  "Removed {name} ({email}).": "{name} ({email}) সরানো হয়েছে।",
  // Fleet panel
  Fleet: "বাস বহর",
  "Coaches available to schedule. Seat count comes from the layout (rows × cols).":
    "যে কোচগুলোতে ট্রিপ ছাড়ানো যাবে। আসন সংখ্যা = সারি × কলাম।",
  "No buses yet.": "এখনো কোনো বাস নেই।",
  Bus: "বাস",
  Operator: "অপারেটর",
  Type: "ধরণ",
  Trips: "ট্রিপ",
  "Has scheduled trips — remove them first":
    "ট্রিপ ছাড়ানো আছে — আগে সেগুলো সরান",
  "Remove this bus": "এই বাসটি সরান",
  "Operator (e.g. Green Line)": "অপারেটর (যেমন Green Line)",
  "Bus name (e.g. Volvo 9600)": "বাসের নাম (যেমন Volvo 9600)",
  "Seat rows": "সারি সংখ্যা",
  "Seats per row": "প্রতি সারিতে আসন",
  "4 across": "৪ আসন করে",
  "5 across": "৫ আসন করে",
  "Add bus": "বাস যোগ করুন",
  "Added {operator} {name} ({type}, {rows}×{cols}).":
    "{operator} {name} ({type}, {rows}×{cols}) যোগ হয়েছে।",
  "Removed {operator} {name}.": "{operator} {name} সরানো হয়েছে।",
  // Trip panel
  "Scheduled services shown in public search. Trips run daily; bookings carry the date. Editing price or times affects future bookings only — paid tickets keep their price.":
    "পাবলিক সার্চে দেখা যায় এমন ছাড়ানো সার্ভিস। ট্রিপ প্রতিদিন চলে; বুকিং নিজস্ব তারিখ বহন করে। দাম বা সময় বদলালে শুধু ভবিষ্যৎ বুকিংয়ে প্রভাব পড়ে — পরিশোধ করা টিকিটের দাম বদলায় না।",
  "No trips scheduled yet.": "এখনো কোনো ট্রিপ ছাড়ানো হয়নি।",
  Route: "রুট",
  Duration: "সময়",
  Price: "ভাড়া",
  Sold: "বিক্রি",
  // Bus types (come from the DB enum)
  "AC Seater": "এসি সিটার",
  Sleeper: "স্লিপার",
  "AC Sleeper": "এসি স্লিপার",
  "Non-AC": "নন-এসি",
  "Has booking history — cannot be removed":
    "বুকিং ইতিহাস আছে — সরানো যাবে না",
  "Remove this trip": "এই ট্রিপটি সরান",
  "Bus…": "বাস…",
  "From…": "কোথা থেকে…",
  "To…": "কোথায়…",
  Minutes: "মিনিট",
  "Price ৳": "ভাড়া ৳",
  "Add trip": "ট্রিপ যোগ করুন",
  "From and to cities must differ.": "যাত্রা শুরু ও গন্তব্য শহর ভিন্ন হতে হবে।",
  "Trip added. It now appears in public search.":
    "ট্রিপ যোগ হয়েছে। এখন থেকে পাবলিক সার্চে দেখা যাবে।",
  "Trip updated. Existing bookings keep the price they paid.":
    "ট্রিপ হালনাগাদ হয়েছে। আগের বুকিং যে দামে হয়েছিল, সেই দামেই থাকবে।",
  "Removed {from} → {to} {time}.": "{from} → {to} {time} সরানো হয়েছে।",
  // Bookings panel
  Bookings: "বুকিং",
  "Find by PNR, email, name or phone": "PNR, ইমেইল, নাম বা ফোন দিয়ে খুঁজুন",
  Search: "খুঁজুন",
  "No bookings yet.": "এখনো কোনো বুকিং নেই।",
  "No bookings matching “{q}”.": "“{q}” মেলে এমন কোনো বুকিং নেই।",
  Passenger: "যাত্রী",
  Amount: "টাকা",
  Boarding: "বোর্ডিং",
  " fee {a}": " ফি {a}",
  "boarded ✓": "উঠেছে ✓",
  "Check in": "চেক-ইন",
};
