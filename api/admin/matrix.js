import { MongoClient } from "mongodb";
import jwt from "jsonwebtoken";

const client = new MongoClient(process.env.MONGODB_URI);

const SEM_ORDER = ["s21", "s22", "s31", "s32"];
const SEM_LABEL = { s21: "2학년 1학기", s22: "2학년 2학기", s31: "3학년 1학기", s32: "3학년 2학기" };
const TEST_CLASS = "115";  // 15반 = 테스트용, 모든 집계에서 제외

// 학기별 선택과목 전체 목록 (열 순서/0명 과목 표시용)
const SEM_COURSES = {
  s21: ["주제 탐구 독서","기하","영미 문학 읽기","세계시민과 지리","현대사회와 윤리","법과 사회","동아시아 역사 기행","금융과 경제생활","물리학","화학","지구과학","세포와 물질대사","데이터 과학","스페인어","일본어","음악 연주와 창작","미술 창작"],
  s22: ["문학과 영상","인공지능 수학","세계 문화와 영어","사회와 문화","세계사","정치","윤리문제 탐구","기후변화와 지속가능한 세계","생명과학","역학과 에너지","물질과 에너지","지구시스템과학","아동발달과 부모","스페인어 회화","일본어 회화","음악 감상과 비평","미술 감상과 비평"],
  s31: ["독서 토론과 글쓰기","미적분Ⅱ","수학과제 탐구","심화 영어","윤리와 사상","경제","한국지리 탐구","사회문제 탐구","역사로 탐구하는 현대 세계","전자기와 양자","화학 반응의 세계","생물의 유전","행성우주과학","융합과학 탐구","소프트웨어와 생활","일본 문화","음악과 미디어","미술과 매체"],
  s32: ["매체 의사소통","언어생활 탐구","수학과 문화","실용 통계","심화 영어 독해와 작문","미디어 영어","국제 관계의 이해","인문학과 윤리","도시의 미래 탐구","여행지리","과학의 역사와 문화","기후변화와 환경생태","지식 재산 일반","스페인어권 문화","심화 일본어","음악콘텐츠 제작 기초","조형탐구1"]
};

function verify(req){
  const auth = req.headers.authorization || "";
  return jwt.verify(auth.replace("Bearer ", ""), process.env.JWT_SECRET);
}
function cell(v){
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const isTest = sid => String(sid).slice(0, 3) === TEST_CLASS;

export default async function handler(req, res){
  // ===== CORS =====
  res.setHeader("Access-Control-Allow-Origin", "https://csolutn.github.io");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  // ================

  if (req.method !== "GET")
    return res.status(405).json({ error: "Method not allowed" });

  let user;
  try { user = verify(req); }
  catch { return res.status(401).json({ error: "로그인이 필요합니다." }); }
  const isAdmin   = user.role === "admin";
  const isTeacher = user.role === "teacher";
  if (!isAdmin && !isTeacher)
    return res.status(403).json({ error: "권한이 없습니다." });

  // 담임(teacher) 권한 제한:
  //  - 담임 학번(user.sid)이 곧 담당 학급 코드(101~113)이며,
  //    학생 sid 앞 3자리가 학급 코드이므로 "본인 학번 === cls" 인 것만 허용한다.
  //  - 전체 현황(overview)·CSV 다운로드 등 학교 전체 데이터는 차단한다.
  //  - 프론트에서 가려도 API를 직접 호출하면 뚫리므로, 반드시 서버에서 막아야 한다.
  if (isTeacher) {
    const tView = req.query.view || "overview";
    if (req.query.download) {
      return res.status(403).json({ error: "담당 학급 현황만 조회할 수 있습니다." });
    } else if (tView === "class") {
      // 학급별 현황: 본인 반(cls === 본인 학번)만 허용
      if (req.query.cls !== user.sid)
        return res.status(403).json({ error: "담당 학급만 조회할 수 있습니다." });
    } else if (tView === "student") {
      // 학생 상세: 본인 반 학생(sid 앞 3자리 === 본인 학번)만 허용
      if (String(req.query.sid || "").slice(0, 3) !== user.sid)
        return res.status(403).json({ error: "담당 학급 학생만 조회할 수 있습니다." });
    } else {
      // overview 등 그 외 모든 요청 차단
      return res.status(403).json({ error: "담당 학급 현황만 조회할 수 있습니다." });
    }
  }

  await client.connect();
  const db = client.db("sugang");
  const subCol = db.collection("submissions");
  const stuCol = db.collection("students");

  const view = req.query.view || "overview";

  // ---------- 학생 1명 상세 (제출 내역) ----------
  if (view === "student") {
    const sid = req.query.sid;
    const sub = await subCol.findOne({ sid });
    if (!sub) return res.status(404).json({ error: "제출 내역이 없습니다." });
    return res.status(200).json(sub);
  }

  // ---------- 학급별 현황 ----------
  if (view === "class") {
    const cls = req.query.cls;  // 예: "101"
    if (!cls) return res.status(400).json({ error: "학급(cls)을 지정하세요." });

    const roster = await stuCol
      .find({ role: "student" }, { projection: { sid: 1, name: 1 } })
      .toArray();
    const inClass = roster
      .filter(s => String(s.sid).slice(0, 3) === cls && !isTest(s.sid))
      .sort((a, b) => String(a.sid).localeCompare(String(b.sid)));

    const subs = await subCol.find({ cls }).toArray();
    const subMap = {};
    subs.forEach(s => { if (!isTest(s.sid)) subMap[s.sid] = s; });

    const students = inClass.map(s => {
      const sub = subMap[s.sid];
      let status = "none";
      if (sub) status = sub.isComplete ? "complete" : "draft";
      return { sid: s.sid, name: s.name, status };
    });

    return res.status(200).json({ cls, students });
  }

  // ---------- 전체 현황 + CSV ----------
  const allStudents = await stuCol
    .find({ role: "student" }, { projection: { sid: 1 } }).toArray();
  const totalStudents = allStudents.filter(s => !isTest(s.sid)).length;

  const subs = (await subCol.find({}).toArray()).filter(s => !isTest(s.sid));
  const submitted = subs.length;

  const semester = SEM_ORDER.includes(req.query.semester) ? req.query.semester : "s21";

  const courses = SEM_COURSES[semester];
  const courseCount = {};
  courses.forEach(c => courseCount[c] = 0);
  subs.forEach(sub => {
    (sub.selections?.[semester] || []).forEach(c => {
      if (c in courseCount) courseCount[c]++;
    });
  });

  // CSV 다운로드
  if (req.query.download) {
    const semList = req.query.semester ? [semester] : SEM_ORDER;
    let csv = "";
    semList.forEach((sem, i) => {
      if (i > 0) csv += "\n\n";
      const cols = SEM_COURSES[sem];
      csv += `[${SEM_LABEL[sem]}]\n`;
      csv += ["학번", "이름", ...cols].map(cell).join(",") + "\n";
      subs
        .slice()
        .sort((a, b) => String(a.sid).localeCompare(String(b.sid)))
        .forEach(sub => {
          const picked = new Set(sub.selections?.[sem] || []);
          csv += [sub.sid, sub.name, ...cols.map(c => (picked.has(c) ? 1 : 0))]
            .map(cell).join(",") + "\n";
        });
    });
    const fname = `sugang_submissions_${req.query.semester || "all"}_${Date.now()}.csv`;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${fname}"`);
    return res.status(200).send("\uFEFF" + csv);
  }

  return res.status(200).json({
    semester,
    totalStudents,
    submitted,
    notSubmitted: totalStudents - submitted,
    courseCounts: courses.map(c => ({ course: c, count: courseCount[c] }))
  });
}
