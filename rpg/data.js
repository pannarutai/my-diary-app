'use strict';
/* Game data for Life RPG. Loaded before app.js. Text pairs are [English, Thai]. */

// The six attributes. Diary categories map onto them in DIARY_STAT.
const STATS = ['str', 'int', 'wlt', 'cre', 'spi', 'cha'];
const ST = {
  str: { icon: '💪', name: ['Strength', 'พลังกาย'], hint: ['Body, exercise, sleep, food', 'ร่างกาย ออกกำลังกาย การนอน อาหาร'] },
  int: { icon: '📘', name: ['Intellect', 'ปัญญา'], hint: ['Learning, reading, work skills', 'การเรียนรู้ การอ่าน ทักษะการงาน'] },
  wlt: { icon: '💰', name: ['Wealth', 'ความมั่งคั่ง'], hint: ['Trading, investing, saving', 'การเทรด การลงทุน การออม'] },
  cre: { icon: '🎨', name: ['Creativity', 'ความคิดสร้างสรรค์'], hint: ['Clips, stories, making things', 'ทำคลิป เล่าเรื่อง สร้างสรรค์ผลงาน'] },
  spi: { icon: '🕯️', name: ['Spirit', 'จิตใจ'], hint: ['Reflection, calm, order', 'การทบทวนตัวเอง ความสงบ ความเป็นระเบียบ'] },
  cha: { icon: '🤝', name: ['Bonds', 'ความสัมพันธ์'], hint: ['Family, friends, kindness', 'ครอบครัว เพื่อน ความมีน้ำใจ'] },
};
const DIARY_STAT = { life: 'spi', health: 'str', invest: 'wlt', work: 'int' };

// [XP, gold] for each difficulty.
const DIFF = { easy: [10, 4], medium: [25, 10], hard: [50, 20], epic: [100, 40] };
const DIFF_NAME = { easy: ['Easy', 'ง่าย'], medium: ['Medium', 'ปานกลาง'], hard: ['Hard', 'ยาก'], epic: ['Epic', 'มหากาพย์'] };

const CLASSES = {
  warrior: ['🗡️', ['Warrior', 'นักรบ']], mage: ['🔮', ['Mage', 'จอมเวท']], ranger: ['🏹', ['Ranger', 'พรานป่า']],
  rogue: ['🗝️', ['Rogue', 'โจร']], paladin: ['🛡️', ['Paladin', 'อัศวินศักดิ์สิทธิ์']], bard: ['🎻', ['Bard', 'กวี']],
};

const BOSS_ICONS = ['🐉', '💀', '👹', '🧛', '🕷️', '🐺', '🌋', '🏰'];
// [hit points, gold reward]
const BOSS_SIZE = { minion: [300, 50], champion: [800, 150], tyrant: [2000, 400] };
const BOSS_SIZE_NAME = { minion: ['Minion', 'ลูกสมุน'], champion: ['Champion', 'ขุนพล'], tyrant: ['Tyrant', 'จอมทรราช'] };

const DAYS = [['Su', 'อา'], ['Mo', 'จ'], ['Tu', 'อ'], ['We', 'พ'], ['Th', 'พฤ'], ['Fr', 'ศ'], ['Sa', 'ส']];

// Created with a new hero, in the language chosen at that moment. They can be edited or deleted.
const STARTER_QUESTS = [
  ['str', 'medium', ['Exercise for 20 minutes', 'ออกกำลังกาย 20 นาที']],
  ['int', 'easy', ['Read 10 pages', 'อ่านหนังสือ 10 หน้า']],
  ['wlt', 'easy', ['Review trades and spending', 'ทบทวนการเทรดและรายจ่าย']],
];
const STARTER_REWARDS = [[100, ['Watch a movie', 'ดูหนังหนึ่งเรื่อง']], [150, ['A favourite meal', 'มื้ออร่อยที่ชอบ']]];

// Special quests: three are drawn at random each day and pay 1.5x. [attribute, difficulty, English, Thai]
const SPECIALS = [
  ['str', 'easy', 'Take a 20-minute walk', 'เดิน 20 นาที'],
  ['str', 'medium', 'Do 30 push-ups or squats', 'วิดพื้นหรือสควอต 30 ครั้ง'],
  ['str', 'easy', 'Stretch for 10 minutes', 'ยืดเหยียด 10 นาที'],
  ['str', 'easy', 'Drink 8 glasses of water', 'ดื่มน้ำ 8 แก้ว'],
  ['str', 'medium', 'Be in bed before 11 pm', 'เข้านอนก่อน 5 ทุ่ม'],
  ['str', 'easy', 'Take the stairs all day', 'ใช้บันไดทั้งวัน'],
  ['str', 'medium', 'No sugary drinks today', 'งดเครื่องดื่มหวานทั้งวัน'],
  ['str', 'medium', 'Cook a healthy meal', 'ทำอาหารสุขภาพหนึ่งมื้อ'],
  ['int', 'easy', 'Read 15 pages of a book', 'อ่านหนังสือ 15 หน้า'],
  ['int', 'easy', 'Learn 10 new English words', 'เรียนศัพท์อังกฤษใหม่ 10 คำ'],
  ['int', 'medium', 'Watch one educational video and take notes', 'ดูคลิปความรู้หนึ่งคลิปแล้วจดโน้ต'],
  ['int', 'medium', 'Study one chart pattern for 15 minutes', 'ศึกษารูปแบบกราฟหนึ่งแบบ 15 นาที'],
  ['int', 'easy', 'Sum up what you learned today in 3 lines', 'สรุปสิ่งที่เรียนรู้วันนี้ใน 3 บรรทัด'],
  ['int', 'medium', 'Read one long article to the end', 'อ่านบทความยาวหนึ่งเรื่องจนจบ'],
  ['int', 'hard', 'Practise a skill for 25 focused minutes', 'ฝึกทักษะหนึ่งอย่างแบบโฟกัส 25 นาที'],
  ['int', 'medium', 'Teach someone one thing', 'สอนใครสักคนหนึ่งเรื่อง'],
  ['wlt', 'medium', "Review yesterday's trades", 'ทบทวนการเทรดของเมื่อวาน'],
  ['wlt', 'easy', "Write down all of today's spending", 'จดรายจ่ายของวันนี้ให้ครบ'],
  ['wlt', 'medium', "Read one company's earnings summary", 'อ่านสรุปผลประกอบการหนึ่งบริษัท'],
  ['wlt', 'medium', 'No unplanned purchases today', 'ไม่ซื้อของนอกแผนทั้งวัน'],
  ['wlt', 'easy', 'Check your portfolio allocation', 'ตรวจสัดส่วนพอร์ตลงทุน'],
  ['wlt', 'hard', 'Backtest one trading idea', 'ทดสอบย้อนหลังหนึ่งไอเดียการเทรด'],
  ['wlt', 'easy', 'Move a little money into savings', 'โอนเงินเข้าบัญชีออมเล็กน้อย'],
  ['wlt', 'easy', 'Review one subscription you pay for', 'ทบทวนค่าบริการรายเดือนหนึ่งรายการ'],
  ['cre', 'easy', 'Write down 5 clip ideas', 'จดไอเดียคลิป 5 ข้อ'],
  ['cre', 'easy', 'Write a hook for a new clip', 'เขียนประโยคเปิดสำหรับคลิปใหม่'],
  ['cre', 'medium', 'Sketch or design something for 15 minutes', 'วาดหรือออกแบบอะไรสักอย่าง 15 นาที'],
  ['cre', 'medium', 'Draft one scene of a script', 'ร่างสคริปต์หนึ่งฉาก'],
  ['cre', 'easy', 'Take 5 photos of interesting things', 'ถ่ายรูปสิ่งที่น่าสนใจ 5 รูป'],
  ['cre', 'medium', 'Improve one old piece of work', 'ปรับปรุงผลงานเก่าหนึ่งชิ้น'],
  ['cre', 'easy', 'Collect 3 references that inspire you', 'เก็บตัวอย่างที่ให้แรงบันดาลใจ 3 ชิ้น'],
  ['cre', 'medium', 'Try a new tool or technique', 'ลองเครื่องมือหรือเทคนิคใหม่'],
  ['spi', 'easy', 'Meditate for 5 minutes', 'นั่งสมาธิ 5 นาที'],
  ['spi', 'medium', 'No phone for the first 30 minutes of the day', 'ไม่จับมือถือ 30 นาทีแรกของวัน'],
  ['spi', 'easy', 'Write 3 things you are grateful for', 'เขียนสิ่งที่ขอบคุณ 3 ข้อ'],
  ['spi', 'easy', 'Tidy your desk', 'จัดโต๊ะทำงานให้เรียบร้อย'],
  ['spi', 'easy', 'Spend 15 minutes outside', 'อยู่กลางแจ้ง 15 นาที'],
  ['spi', 'medium', 'One hour with no social media', 'งดโซเชียลมีเดียหนึ่งชั่วโมง'],
  ['spi', 'easy', 'Write a diary entry', 'เขียนบันทึกประจำวัน'],
  ['spi', 'easy', 'Take 10 slow breaths when you feel stressed', 'หายใจช้า ๆ 10 ครั้งเมื่อรู้สึกเครียด'],
  ['cha', 'easy', 'Message a friend you have not talked to lately', 'ทักเพื่อนที่ไม่ได้คุยกันนาน'],
  ['cha', 'medium', 'Call a family member', 'โทรหาคนในครอบครัว'],
  ['cha', 'easy', 'Give someone a sincere compliment', 'ชมใครสักคนอย่างจริงใจ'],
  ['cha', 'medium', 'Help someone without being asked', 'ช่วยเหลือใครสักคนโดยไม่ต้องให้ขอ'],
  ['cha', 'medium', 'Share a meal with someone, phone away', 'กินข้าวกับใครสักคนโดยเก็บมือถือ'],
  ['cha', 'easy', 'Thank someone and say exactly why', 'ขอบคุณใครสักคนพร้อมบอกเหตุผล'],
  ['cha', 'easy', 'Listen fully in one conversation', 'ตั้งใจฟังเต็มที่ในหนึ่งบทสนทนา'],
  ['cha', 'easy', 'Share something useful with someone', 'แบ่งปันสิ่งที่มีประโยชน์ให้ใครสักคน'],
];
