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

  // 담임(teacher) 권한 제한
  if (isTeacher) {
    const tView = req.query.view || "overview";
    if (req.query.download) {
      return res.status(403).json({ error: "담당 학급 현황만 조회할 수 있습니다." });
    } else if (tView === "class") {
      if (req.query.cls !== user.sid)
        return res.status(403).json({ error: "담당 학급만 조회할 수 있습니다." });
    } else if (tView === "student") {
      if (String(req.query.sid || "").slice(0, 3) !== user.sid)
        return res.status(403).json({ error: "담당 학급 학생만 조회할 수 있습니다." });
    } else {
      return res.status(403).json({ error: "담당 학급 현황만 조회할 수 있습니다." });
    }
  }

  await client.connect();
  const db     = client.db("sugang");
  const subCol = db.collection("submissions");
  const stuCol = db.collection("students");
  const rdCol  = db.collection("roadmaps");

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
    const cls = req.query.cls;
    if (!cls) return res.status(400).json({ error: "학급(cls)을 지정하세요." });

    // [개선 1] 전교생 로드 후 JS 필터 → DB 레벨 정규식 필터
    //          students.sid 에 인덱스가 있으면 컬렉션 스캔 없이 바로 조회됨
    // [개선 2] submissions·roadmaps 순차 조회 → Promise.all 병렬 조회
    // [개선 3] submissions·roadmaps 모두 sid만 projection (도큐먼트 전체 전송 불필요)
    const clsRegex = { $regex: `^${cls}` };
    const [inClass, subDocs, rdDocs] = await Promise.all([
      // ① 해당 반 학생 명단 — DB 필터 + 정렬을 DB에서 처리
      stuCol
        .find(
          { role: "student", sid: clsRegex },
          { projection: { sid: 1, name: 1, _id: 0 } }
        )
        .sort({ sid: 1 })
        .toArray(),

      // ② 해당 반 제출 현황 — sid만 가져오면 충분 (status 판정에 sid만 필요)
      subCol
        .find(
          { cls },
          { projection: { sid: 1, _id: 0 } }
        )
        .toArray(),

      // ③ 해당 반 임시저장 현황 — sid만 가져오면 충분
      rdCol
        .find(
          { sid: clsRegex },
          { projection: { sid: 1, _id: 0 } }
        )
        .toArray(),
    ]);

    // 테스트반 제외 후 Set으로 O(1) 조회
    const subSet = new Set(subDocs.filter(s => !isTest(s.sid)).map(s => s.sid));
    const rdSet  = new Set(rdDocs.filter(s => !isTest(s.sid)).map(s => s.sid));

    // status 판정
    //   complete = submissions 있음 (제출 = 무조건 조건충족)
    //   draft    = roadmaps 있음 + submissions 없음 (임시저장만, 담임에게 내용 비공개)
    //   none     = 둘 다 없음
    const students = inClass
      .filter(s => !isTest(s.sid))
      .map(s => {
        let status = "none";
        if (subSet.has(s.sid))     status = "complete";
        else if (rdSet.has(s.sid)) status = "draft";
        return { sid: s.sid, name: s.name, status };
      });

    return res.status(200).json({ cls, students });
  }

  // ---------- 전체 현황 + CSV ----------
  // [개선 4] totalStudents 카운트·submissions 조회 순차 → Promise.all 병렬
  // [개선 5] totalStudents는 countDocuments로 단순 카운트 (전체 도큐먼트 로드 불필요)
  // [개선 6] submissions: CSV는 sid+name+selections 필요, overview는 sid+selections만 필요
  //          → CSV 여부에 따라 projection 분기
  const needName   = !!req.query.download;  // CSV 시에만 name 필요
  const subProj    = needName
    ? { sid: 1, name: 1, selections: 1, _id: 0 }
    : { sid: 1, selections: 1, _id: 0 };

  const [totalStudents, allSubs] = await Promise.all([
    // ① 전교생 수 — 도큐먼트 로드 없이 카운트만
    stuCol.countDocuments({ role: "student", sid: { $not: { $regex: `^${TEST_CLASS}` } } }),

    // ② 제출 현황 — 테스트반 제외 필터를 DB 레벨에서 처리
    subCol
      .find(
        { sid: { $not: { $regex: `^${TEST_CLASS}` } } },
        { projection: subProj }
      )
      .toArray(),
  ]);

  const subs      = allSubs;  // 이미 테스트반 제외됨
  const submitted = subs.length;
  const semester  = SEM_ORDER.includes(req.query.semester) ? req.query.semester : "s21";

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

  // overview 응답
  const courses     = SEM_COURSES[semester];
  const courseCount = {};
  courses.forEach(c => courseCount[c] = 0);
  subs.forEach(sub => {
    (sub.selections?.[semester] || []).forEach(c => {
      if (c in courseCount) courseCount[c]++;
    });
  });

  return res.status(200).json({
    semester,
    totalStudents,
    submitted,
    notSubmitted: totalStudents - submitted,
    courseCounts: courses.map(c => ({ course: c, count: courseCount[c] }))
  });
}
