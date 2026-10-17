// Bolles 2026-27 bell schedules, special days and calendar events,
// transcribed from the official Middle School (Bartram) and Upper School
// (San Jose) student planners. Times are 24-hour 'HH:MM'.
//
// Schedule blocks:
//   { slot: n, start, end }       nth class of the day; the period comes from the letter day
//   { period: n, start, end }     a fixed period (used on alt days that meet every period)
//   { label, start, end, kind }   non-class time (advisory, lunch, break, ...)
//   { slot: n, lunchSplit: {...} } Upper School 3rd block: class and lunch order
//                                   depend on the teacher (see US_LUNCH_TEACHERS)

import { MS_LETTERS, US_LETTERS } from './letters-2026-27.js';

export const SCHOOL_YEAR = {
  id: '2026-27',
  firstDay: '2026-08-13',
  lastDay: '2027-05-28',
};

// Which periods meet, in order, on each letter day. Both campuses use this rotation.
export const ROTATION = {
  A: [1, 2, 3, 4, 5],
  B: [6, 7, 1, 2, 3],
  C: [4, 5, 6, 7, 1],
  D: [2, 3, 4, 5, 6],
  E: [7, 1, 2, 3, 4],
  F: [5, 6, 7, 1, 2],
  G: [3, 4, 5, 6, 7],
};

// ---------------------------------------------------------------------------
// Upper School · San Jose
// ---------------------------------------------------------------------------

const US_LUNCH_SPLIT = {
  classFirst: { class: ['11:25', '12:25'], lunch: ['12:25', '13:05'] },
  lunchFirst: { lunch: ['11:25', '12:05'], class: ['12:05', '13:05'] },
};

const US_REGULAR = [
  { slot: 1, start: '08:30', end: '09:30' },
  { slot: 2, start: '09:35', end: '10:35' },
  { label: 'Activities', kind: 'activity', start: '10:35', end: '11:25' },
  { slot: 3, start: '11:25', end: '13:05', lunchSplit: US_LUNCH_SPLIT },
  { slot: 4, start: '13:10', end: '14:10' },
  { slot: 5, start: '14:15', end: '15:15' },
];

const US_ADVISORY_CIRCLES = [
  { slot: 1, start: '08:30', end: '09:30' },
  { slot: 2, start: '09:35', end: '10:35' },
  { label: 'Advisory Circles', kind: 'advisory', start: '10:35', end: '11:00' },
  { label: 'Activities', kind: 'activity', start: '11:00', end: '11:25' },
  { slot: 3, start: '11:25', end: '13:05', lunchSplit: US_LUNCH_SPLIT },
  { slot: 4, start: '13:10', end: '14:10' },
  { slot: 5, start: '14:15', end: '15:15' },
];

const US_LATE_START = [
  { label: 'Zero Hour', kind: 'zero', start: '08:45', end: '09:15' },
  { slot: 1, start: '09:15', end: '10:15' },
  { slot: 2, start: '10:20', end: '11:20' },
  { slot: 3, start: '11:25', end: '13:05', lunchSplit: US_LUNCH_SPLIT },
  { slot: 4, start: '13:10', end: '14:10' },
  { slot: 5, start: '14:15', end: '15:15' },
];

const US_SPECIAL = {
  '2026-08-13': {
    name: 'First Day of Classes (altered schedule)',
    blocks: [
      { label: 'Advisory Circles', kind: 'advisory', start: '08:30', end: '08:50' },
      { slot: 1, start: '08:55', end: '09:30' },
      { slot: 2, start: '09:35', end: '10:10' },
      { label: 'Advisory Circles', kind: 'advisory', start: '10:10', end: '10:35' },
      { label: 'Activities', kind: 'activity', start: '10:40', end: '11:20' },
      {
        slot: 3,
        start: '11:25',
        end: '12:45',
        lunchSplit: {
          classFirst: { class: ['11:25', '12:00'], lunch: ['12:05', '12:45'] },
          lunchFirst: { lunch: ['11:25', '12:05'], class: ['12:10', '12:45'] },
        },
      },
      { slot: 4, start: '12:50', end: '13:25' },
      { label: 'Advisory Circles', kind: 'advisory', start: '13:30', end: '14:05' },
      { label: 'Advisory Circles', kind: 'advisory', start: '14:10', end: '14:35' },
      { slot: 5, start: '14:40', end: '15:15' },
    ],
  },
  '2026-08-14': {
    name: 'Second Day of Classes',
    blocks: [
      { label: 'Advisory Circles', kind: 'advisory', start: '08:30', end: '08:50' },
      { slot: 1, start: '08:55', end: '09:30' },
      { slot: 2, start: '09:35', end: '10:10' },
      { label: 'Advisory Circles', kind: 'advisory', start: '10:10', end: '10:40' },
      { label: 'Activities', kind: 'activity', start: '10:45', end: '11:25' },
      { slot: 3, start: '11:25', end: '13:05', lunchSplit: US_LUNCH_SPLIT },
      { slot: 4, start: '13:10', end: '14:10' },
      { slot: 5, start: '14:15', end: '15:15' },
    ],
  },
  '2026-10-07': {
    name: 'SPARK/PSAT Day · Senior Camp College Day',
    note: 'Attendance required for all students. Schedule to be announced.',
    blocks: [],
  },
  '2026-10-09': {
    name: 'Homecoming (altered schedule)',
    blocks: [
      { slot: 1, start: '08:30', end: '09:20' },
      { slot: 2, start: '09:25', end: '10:15' },
      { label: 'Break', kind: 'break', start: '10:15', end: '10:35' },
      { slot: 3, start: '10:35', end: '11:25' },
      {
        slot: 4,
        start: '11:30',
        end: '13:00',
        lunchSplit: {
          classFirst: { class: ['11:30', '12:20'], lunch: ['12:20', '13:00'] },
          lunchFirst: { lunch: ['11:30', '12:10'], class: ['12:10', '13:00'] },
        },
      },
      { slot: 5, start: '13:05', end: '13:55' },
      { label: 'Pep Rally', kind: 'event', start: '13:55', end: '14:30' },
      { label: 'Homecoming Festival, Bolles Hall Lawn', kind: 'event', start: '14:30', end: '15:15' },
    ],
  },
  '2026-11-19': {
    name: "Grandparents' Day (altered schedule)",
    blocks: [
      { slot: 1, start: '08:30', end: '09:25' },
      { slot: 2, start: '09:35', end: '10:25' },
      { label: 'Break', kind: 'break', start: '10:25', end: '10:40' },
      { slot: 3, start: '10:40', end: '11:35' },
      {
        slot: 4,
        start: '11:40',
        end: '13:15',
        lunchSplit: {
          classFirst: { class: ['11:40', '12:25'], lunch: ['12:25', '13:15'] },
          lunchFirst: { lunch: ['11:40', '12:20'], class: ['12:20', '13:15'] },
        },
      },
      { label: "Grandparents' Day", kind: 'event', start: '13:20', end: '14:10' },
      { slot: 5, start: '14:15', end: '15:15' },
    ],
  },
  '2027-05-21': {
    name: 'Awards Day (altered schedule)',
    blocks: [
      { slot: 1, start: '08:30', end: '09:30' },
      { slot: 2, start: '09:35', end: '10:35' },
      { label: 'Awards Day', kind: 'event', start: '10:40', end: '12:10' },
      { label: 'Lunch (all students)', kind: 'lunch', start: '12:15', end: '13:05' },
      { slot: 3, start: '13:10', end: '13:50' },
      { slot: 4, start: '13:55', end: '14:35' },
      { slot: 5, start: '14:40', end: '15:15' },
    ],
  },
};

// Exam days: the planner only prints each exam session's start time.
const US_EXAM_SESSIONS = [
  { label: 'Exam session', kind: 'exam', start: '08:30' },
  { label: 'Exam session', kind: 'exam', start: '11:00' },
  { label: 'Exam session', kind: 'exam', start: '13:45' },
];
const usExamDay = (name, sessions) => ({ name, exam: true, blocks: sessions });
Object.assign(US_SPECIAL, {
  '2026-12-14': usExamDay('Reading Morning · Afternoon Exams', [US_EXAM_SESSIONS[2]]),
  '2026-12-15': usExamDay('Semester Exams', US_EXAM_SESSIONS),
  '2026-12-16': usExamDay('Semester Exams', US_EXAM_SESSIONS),
  '2026-12-17': usExamDay('Semester Exams', US_EXAM_SESSIONS),
  '2026-12-18': usExamDay('Semester Exams', US_EXAM_SESSIONS),
  '2027-05-25': usExamDay('Semester Exams', US_EXAM_SESSIONS),
  '2027-05-26': usExamDay('Semester Exams', US_EXAM_SESSIONS),
  '2027-05-27': usExamDay('Semester Exams', US_EXAM_SESSIONS),
  '2027-05-28': usExamDay('Semester Exams', [
    { label: 'Graduation practice (all seniors)', kind: 'event', start: '08:30', end: '10:30', grades: [12] },
    US_EXAM_SESSIONS[1],
    US_EXAM_SESSIONS[2],
  ]),
});

const US_ADVISORY_CIRCLE_DATES = [
  '2026-08-31', '2026-09-14', '2026-09-28', '2026-10-12', '2026-10-26', '2026-11-09',
  '2026-11-30', '2027-01-11', '2027-01-25', '2027-02-08', '2027-02-22', '2027-03-22',
  '2027-04-05', '2027-04-19', '2027-05-03', '2027-05-17',
];
for (const date of US_ADVISORY_CIRCLE_DATES) {
  US_SPECIAL[date] ??= { name: 'Advisory Circles', blocks: US_ADVISORY_CIRCLES, minor: true };
}

// From the planner's "Teacher/Lunch Information" page: on days when your
// 3rd-block class is with one of these teachers you go to lunch first.
// Some teachers are listed by subject because they appear on both lists.
export const US_LUNCH_TEACHERS = {
  lunchFirst: [
    'Bruns - Precalculus', 'Buitrago', 'Bullington', 'Chandler', 'Curran, K', "D'Angelo",
    'Desrosiers', 'Dividu', 'Dostert, L', 'Dostert, P', 'Edmonson', 'Elliott', 'Ezzell',
    'Ferrari', 'Ford - Psychology', 'Gomez, J', 'Gwynes', 'Hart - CGAP', 'Hedrick', 'Hervol',
    'Hilf', 'Jacobson', 'Kervin', 'Kmieciak', 'Kostandarithes - MEHAP', 'Kuonen', 'Laco',
    'Lieb', 'Lyons', 'McNesby', 'Moyer', 'Moyer-Shad', 'Phillips', 'Posick', 'Veedu, P',
    'Rippel', 'Robinson', 'Saladino', 'Skapetis', 'Stam, A', 'Stam, S', 'Toblin', 'Yeakel',
  ],
  classFirst: [
    'Alloway', 'Amell', 'Bauman', 'Berg', 'Boylan', 'Bruns - Geometry/SH', 'Clubb', 'Collins',
    'Crotty', 'Curran, B', 'Dale', 'Dickson', 'Ford - BWS', 'Garcia', 'Gastaldi', 'Gentry',
    'Gonzalez', 'Greenland', 'Hart - USH & WH', 'Hazzard', 'Henley', 'Hicks', 'Hoekstra', 'Jump',
    'Lawrence', 'Li', 'Milano', 'Mulvey', 'Murray', 'Nettles', "O'Neill", 'Pelletier', 'Roland',
    'Rothschild', 'Ryan', 'Sander', 'Sollee', 'Stover', 'Vance', 'Westerlind', 'Wilinski-Hodel',
  ],
};

// ---------------------------------------------------------------------------
// Middle School · Bartram
// ---------------------------------------------------------------------------

const MS_LUNCHES = [
  { label: 'Grade 8 Lunch', kind: 'lunch', start: '12:05', end: '12:25', grades: [8] },
  { label: 'Grade 6 Lunch', kind: 'lunch', start: '12:25', end: '12:40', grades: [6] },
  { label: 'Grade 7 Lunch', kind: 'lunch', start: '12:40', end: '13:00', grades: [7] },
];

const msRegular = (midBlock) => [
  { label: 'Zero Hour', kind: 'zero', start: '08:00', end: '08:30' },
  { label: 'Advisory', kind: 'advisory', start: '08:30', end: '08:40' },
  { slot: 1, start: '08:45', end: '09:40' },
  { slot: 2, start: '09:45', end: '10:40' },
  { label: midBlock, kind: midBlock === 'Advisory' ? 'advisory' : 'activity', start: '10:40', end: '11:10' },
  { slot: 3, start: '11:10', end: '12:05' },
  ...MS_LUNCHES,
  { slot: 4, start: '13:05', end: '14:00' },
  { slot: 5, start: '14:05', end: '15:00' },
];

const MS_LATE_START = [
  { slot: 1, start: '08:55', end: '09:50' },
  { slot: 2, start: '09:55', end: '10:50' },
  { label: 'Break', kind: 'break', start: '10:50', end: '11:10' },
  { slot: 3, start: '11:10', end: '12:05' },
  ...MS_LUNCHES,
  { slot: 4, start: '13:05', end: '14:00' },
  { slot: 5, start: '14:05', end: '15:00' },
];

// The 10:40 block is Convocation on Mondays, Advisory on Thursdays and
// Activities on Tuesdays and Fridays, except on these dates.
const MS_MID_BLOCK_BY_WEEKDAY = { 1: 'Convocation', 2: 'Activities', 4: 'Advisory', 5: 'Activities' };
const MS_MID_BLOCK_OVERRIDES = {
  '2026-08-13': 'Convocation',
  '2026-10-05': 'Activities',
  '2026-11-09': 'Activities',
  '2026-12-14': 'Activities',
};

const MS_SPECIAL = {
  '2026-10-07': {
    name: 'Community Connections Day',
    note: 'No regular classes.',
    blocks: [],
  },
  '2026-11-20': {
    name: "Grandparents' Day (altered schedule)",
    blocks: [
      { label: 'Zero Hour', kind: 'zero', start: '08:00', end: '08:30' },
      { label: 'Advisory', kind: 'advisory', start: '08:30', end: '08:40' },
      { slot: 1, start: '08:45', end: '09:35' },
      { slot: 2, start: '09:40', end: '10:30' },
      { label: 'Break', kind: 'break', start: '10:30', end: '10:45' },
      { slot: 3, start: '10:45', end: '11:30' },
      { label: 'Grade 8 Lunch', kind: 'lunch', start: '11:30', end: '11:50', grades: [8] },
      { label: 'Grade 6 Lunch', kind: 'lunch', start: '11:50', end: '12:05', grades: [6] },
      { label: 'Grade 7 Lunch', kind: 'lunch', start: '12:05', end: '12:25', grades: [7] },
      { slot: 4, start: '12:30', end: '13:15' },
      { slot: 5, start: '13:20', end: '14:05' },
      { label: "Grandparents' Day", kind: 'event', start: '14:05', end: '15:00' },
    ],
  },
  '2026-12-15': {
    name: 'All-period day (altered schedule) · Quarter 2 ends',
    blocks: [
      { label: 'Advisory', kind: 'advisory', start: '08:30', end: '08:40' },
      { period: 1, start: '08:45', end: '09:25' },
      { period: 2, start: '09:30', end: '10:10' },
      { label: 'Break', kind: 'break', start: '10:10', end: '10:25' },
      { period: 3, start: '10:25', end: '11:05' },
      { period: 4, start: '11:10', end: '11:50' },
      { label: 'Grade 8 Lunch', kind: 'lunch', start: '11:50', end: '12:10', grades: [8] },
      { label: 'Grade 6 Lunch', kind: 'lunch', start: '12:10', end: '12:25', grades: [6] },
      { label: 'Grade 7 Lunch', kind: 'lunch', start: '12:25', end: '12:45', grades: [7] },
      { period: 5, start: '12:50', end: '13:30' },
      { period: 6, start: '13:35', end: '14:15' },
      { period: 7, start: '14:20', end: '15:00' },
    ],
  },
  '2026-12-17': { name: 'Middle School Exams', exam: true, blocks: [] },
  '2026-12-18': { name: 'Middle School Make-Up Exams', exam: true, blocks: [] },
  '2027-05-21': {
    name: 'Last Day of Classes · Middle School Madness',
    blocks: [
      { label: 'Zero Hour', kind: 'zero', start: '08:00', end: '08:30' },
      { label: 'Advisory', kind: 'advisory', start: '08:30', end: '08:40' },
      { slot: 1, start: '08:45', end: '09:40' },
      { slot: 2, start: '09:45', end: '10:40' },
      { label: 'Middle School Madness', kind: 'event', start: '10:40', end: '15:00' },
    ],
  },
  '2027-05-25': { name: 'Exams', exam: true, blocks: [] },
  '2027-05-26': { name: 'Exams', exam: true, blocks: [] },
  '2027-05-27': { name: 'Exams', exam: true, blocks: [] },
  '2027-05-28': { name: 'Middle School Make-Up Exams', exam: true, blocks: [] },
};

// ---------------------------------------------------------------------------
// Calendar events
// kind: closed (no school) | noclasses | exam | grading | notests | nohomework
//       | testing (SAT/ACT) | dress | event | observance
// ---------------------------------------------------------------------------

const SHARED_EVENTS = [
  { date: '2026-09-07', title: 'Labor Day · school closed', kind: 'closed' },
  { date: '2026-09-11', title: 'Quarter 1 interim', kind: 'grading' },
  { date: '2026-10-01', title: 'Quarter 1 ends', kind: 'grading' },
  { date: '2026-10-15', end: '2026-10-16', title: 'Conference Day · no classes', kind: 'noclasses' },
  { date: '2026-10-19', title: 'Fall Break · school closed', kind: 'closed' },
  { date: '2026-11-05', title: 'Quarter 2 interim', kind: 'grading' },
  { date: '2026-11-06', title: 'Professional Development Day · no classes', kind: 'noclasses' },
  { date: '2026-11-06', title: 'Diwali', kind: 'observance' },
  { date: '2026-11-09', title: 'Diwali · no quizzes or tests', kind: 'notests' },
  { date: '2026-11-11', title: 'Veterans Day', kind: 'observance' },
  { date: '2026-11-23', end: '2026-11-27', title: 'Thanksgiving Break · school closed', kind: 'closed' },
  { date: '2026-12-21', end: '2027-01-04', title: 'Winter Break · school closed', kind: 'closed' },
  { date: '2027-01-05', title: 'Professional Development Day · no classes', kind: 'noclasses' },
  { date: '2027-01-06', title: 'Classes resume after Winter Break', kind: 'event' },
  { date: '2027-01-18', title: 'Martin Luther King Jr. Holiday · school closed', kind: 'closed' },
  { date: '2027-02-04', title: 'Quarter 3 interim', kind: 'grading' },
  { date: '2027-02-06', title: 'Lunar New Year', kind: 'observance' },
  { date: '2027-02-15', title: "Presidents' Day · school closed", kind: 'closed' },
  { date: '2027-03-08', end: '2027-03-12', title: 'Spring Break · school closed', kind: 'closed' },
  { date: '2027-03-10', title: 'Eid al-Fitr', kind: 'observance' },
  { date: '2027-03-16', title: 'Quarter 3 ends', kind: 'grading' },
  { date: '2027-03-26', title: 'Spring Holiday · school closed', kind: 'closed' },
  { date: '2027-03-29', title: 'Spring Holiday · school closed', kind: 'closed' },
  { date: '2027-04-16', title: 'Quarter 4 interim', kind: 'grading' },
  { date: '2027-04-23', title: 'Professional Development Day · no classes', kind: 'noclasses' },
  { date: '2027-04-26', title: 'April Holiday · school closed', kind: 'closed' },
  { date: '2027-05-17', title: 'Eid al-Adha · no homework, quizzes or tests', kind: 'notests' },
  { date: '2027-05-21', title: 'Quarter 4 ends · last day of classes', kind: 'grading' },
  { date: '2027-05-24', title: 'Reading Day · no classes', kind: 'noclasses' },
  { date: '2027-05-29', title: 'Graduation for the Class of 2027, 8:30 a.m.', kind: 'event' },
  { date: '2027-05-31', title: 'Memorial Day · school closed', kind: 'closed' },
];

const US_EVENTS = [
  ...SHARED_EVENTS,
  { date: '2026-08-12', title: 'New student orientation (Grade 9 and new Grade 10-12)', kind: 'event' },
  { date: '2026-08-13', title: 'First Day of Classes', kind: 'event' },
  { date: '2026-08-22', title: 'SAT testing', kind: 'testing' },
  { date: '2026-08-31', title: 'Formal Dress Day', kind: 'dress' },
  { date: '2026-09-03', title: 'Grade 12 Camp College', kind: 'event', grades: [12] },
  { date: '2026-09-03', title: 'Grade 9 Respect Retreat', kind: 'event', grades: [9] },
  { date: '2026-09-03', title: 'Upper School Back to School Night', kind: 'event' },
  { date: '2026-09-08', title: 'Student Life Expo', kind: 'event' },
  { date: '2026-09-10', end: '2026-09-11', title: 'Portrait Day', kind: 'event' },
  { date: '2026-09-12', title: 'SAT testing', kind: 'testing' },
  { date: '2026-09-14', title: 'Rosh Hashanah · no quizzes or tests', kind: 'notests' },
  { date: '2026-09-19', title: 'ACT testing', kind: 'testing' },
  { date: '2026-09-21', title: 'Yom Kippur · no homework', kind: 'nohomework' },
  { date: '2026-09-22', title: 'Yom Kippur · no quizzes or tests', kind: 'notests' },
  { date: '2026-09-28', title: 'Formal Dress Day', kind: 'dress' },
  { date: '2026-10-03', title: 'SAT testing', kind: 'testing' },
  { date: '2026-10-05', end: '2026-10-09', title: 'Homecoming Week', kind: 'event' },
  { date: '2026-10-07', title: 'SPARK/PSAT Day (Grades 9-11, attendance required)', kind: 'event', grades: [9, 10, 11] },
  { date: '2026-10-07', title: 'Senior Camp College Day', kind: 'event', grades: [12] },
  { date: '2026-10-10', title: 'Homecoming Dance', kind: 'event' },
  { date: '2026-10-17', title: 'ACT testing', kind: 'testing' },
  { date: '2026-10-26', title: 'Formal Dress Day', kind: 'dress' },
  { date: '2026-11-07', title: 'SAT testing', kind: 'testing' },
  { date: '2026-11-11', title: 'Formal Dress Day', kind: 'dress' },
  { date: '2026-11-19', title: 'Formal Dress Day', kind: 'dress' },
  { date: '2026-11-19', title: "Grandparents' Day", kind: 'event' },
  { date: '2026-12-05', title: 'SAT testing', kind: 'testing' },
  { date: '2026-12-11', title: 'Upper School Quarter 2 ends', kind: 'grading' },
  { date: '2026-12-12', title: 'ACT testing', kind: 'testing' },
  { date: '2026-12-14', title: 'Upper School Reading Morning · afternoon exams', kind: 'exam' },
  { date: '2026-12-15', end: '2026-12-18', title: 'Upper School Semester Exams', kind: 'exam' },
  { date: '2027-01-25', title: 'Formal Dress Day', kind: 'dress' },
  { date: '2027-02-12', title: 'Conference Day · no classes', kind: 'noclasses' },
  { date: '2027-02-22', title: 'Formal Dress Day', kind: 'dress' },
  { date: '2027-02-27', title: 'ACT testing', kind: 'testing' },
  { date: '2027-03-01', end: '2027-03-05', title: 'Spring Week', kind: 'event' },
  { date: '2027-03-06', title: 'SAT testing', kind: 'testing' },
  { date: '2027-04-10', title: 'ACT testing', kind: 'testing' },
  { date: '2027-04-17', title: 'Junior/Senior Prom', kind: 'event', grades: [11, 12] },
  { date: '2027-04-19', title: 'Senior Skip Day', kind: 'event', grades: [12] },
  { date: '2027-05-01', title: 'SAT testing', kind: 'testing' },
  { date: '2027-05-03', end: '2027-05-07', title: 'AP Week 1', kind: 'testing' },
  { date: '2027-05-10', end: '2027-05-14', title: 'AP Week 2', kind: 'testing' },
  { date: '2027-05-21', title: 'Awards Day', kind: 'event' },
  { date: '2027-05-25', end: '2027-05-28', title: 'Upper School Semester Exams', kind: 'exam' },
  { date: '2027-05-28', title: 'Mandatory graduation practice (all seniors, 8:30-10:30 a.m.)', kind: 'event', grades: [12] },
];

const MS_EVENTS = [
  ...SHARED_EVENTS,
  { date: '2026-08-12', title: 'New student orientation (Grade 6 and new Grade 7-8)', kind: 'event' },
  { date: '2026-08-13', title: 'First Day of Classes', kind: 'event' },
  { date: '2026-08-20', title: 'Back-to-School Night, 6-8 p.m.', kind: 'event' },
  { date: '2026-09-11', title: 'Rosh Hashanah · no homework', kind: 'nohomework' },
  { date: '2026-09-14', title: 'Rosh Hashanah · no quizzes or tests', kind: 'notests' },
  { date: '2026-09-17', title: 'Picture Day', kind: 'event' },
  { date: '2026-09-21', title: 'Yom Kippur · no homework, quizzes or tests', kind: 'notests' },
  { date: '2026-09-22', title: 'Yom Kippur · no quizzes or tests', kind: 'notests' },
  { date: '2026-10-07', title: 'Community Connections Day', kind: 'event' },
  { date: '2026-10-09', title: 'Picture Retake Day', kind: 'event' },
  { date: '2026-10-27', end: '2026-10-30', title: 'Grade 8 Class Trip', kind: 'event', grades: [8] },
  { date: '2026-11-20', title: "Grandparents' Day · Thanksgiving Break begins after school", kind: 'event' },
  { date: '2026-12-15', title: 'Middle School Quarter 2 ends', kind: 'grading' },
  { date: '2026-12-16', title: 'Middle School Reading Day · no classes', kind: 'noclasses' },
  { date: '2026-12-17', title: 'Middle School Exams', kind: 'exam' },
  { date: '2026-12-18', title: 'Middle School Make-Up Exams', kind: 'exam' },
  { date: '2027-02-12', title: 'Parent Conference Day · no classes', kind: 'noclasses' },
  { date: '2027-03-15', title: 'ERB Demo Day', kind: 'testing' },
  { date: '2027-03-16', end: '2027-03-19', title: 'ERB Testing', kind: 'testing' },
  { date: '2027-05-21', title: 'Middle School Madness', kind: 'event' },
  { date: '2027-05-25', end: '2027-05-27', title: 'Exams', kind: 'exam' },
  { date: '2027-05-27', title: 'Grade 8 Recognition', kind: 'event', grades: [8] },
  { date: '2027-05-28', title: 'Middle School Make-Up Exams', kind: 'exam' },
];

// ---------------------------------------------------------------------------

export const CAMPUSES = {
  us: {
    id: 'us',
    name: 'Upper School · San Jose',
    shortName: 'Upper School',
    grades: [9, 10, 11, 12],
    letters: US_LETTERS,
    events: US_EVENTS,
    special: US_SPECIAL,
    hasLunchSplit: true,
    regularBlocks: () => US_REGULAR,
    lateStartBlocks: () => US_LATE_START,
  },
  ms: {
    id: 'ms',
    name: 'Middle School · Bartram',
    shortName: 'Middle School',
    grades: [6, 7, 8],
    letters: MS_LETTERS,
    events: MS_EVENTS,
    special: MS_SPECIAL,
    hasLunchSplit: false,
    regularBlocks: (date, weekday) =>
      msRegular(MS_MID_BLOCK_OVERRIDES[date] ?? MS_MID_BLOCK_BY_WEEKDAY[weekday] ?? 'Activities'),
    lateStartBlocks: () => MS_LATE_START,
  },
};
