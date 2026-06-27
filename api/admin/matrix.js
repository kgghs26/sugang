import { MongoClient } from "mongodb";
import jwt from "jsonwebtoken";

const client = new MongoClient(process.env.MONGODB_URI);

// 학기 표시 순서/이름
const SEM_ORDER = ["s21", "s22", "s31", "s32"];
const SEM_LABEL = { s21: "2-1", s22: "2-2", s31: "3-1", s32: "3-2" };

function verify(req) {
  const auth = req.headers.authorization || "";
  return jwt.verify(auth.replace("Bearer ", ""), process.env.JWT_SECRET);
}

// CSV 셀 escape (콤마/따옴표/줄바꿈 처리)
function cell(v) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default async function handler(req, res) {
  // ===== CORS 허용 =====
  res.setHeader("Access-Control-Allow-Origin", "https://csolutn.github.io");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  // =====================

  if (req.method !== "GET")
    return res.status(405).json({ error: "Method not allowed" });

  // 관리자 인증
  let user;
  try { user = verify(req); }
  catch { return res.status(401).json({ error: "로그인이 필요합니다." }); }
  if (user.role !== "admin")
    return res.status(403).json({ error: "관리자만 접근할 수 있습니다." });

  const { semester, download } = req.query;
  const semesters = semester && SEM_ORDER.includes(semester)
    ? [semester] : SEM_ORDER;

  await client.connect();
  const db = client.db("sugang");

  // 1) 학생별 가장 최근 로드맵 1건만 선택 (savedAt 내림차순 → 그룹 첫 항목)
  const latest = await db.collection("roadmaps").aggregate([
    { $sort: { savedAt: -1 } },
    { $group: {
        _id: "$sid",
        name: { $first: "$name" },
        selections: { $first: "$selections" },
        savedAt: { $first: "$savedAt" }
    }}
  ]).toArray();

  // 2) 학생 이름 매핑 (students 컬렉션)
  const students = await db.collection("students")
    .find({}, { projection: { sid: 1, name: 1 } }).toArray();
  const nameOf = {};
  students.forEach(s => { nameOf[s.sid] = s.name; });

  // 3) 학기별 결과 구성
  const result = {};   // { s21: { columns:[과목...], rows:[{sid,name,values:[0/1...]}] }, ... }

  semesters.forEach(sem => {
    // 해당 학기에 등장하는 과목 집합 수집
    const courseSet = new Set();
    latest.forEach(rd => {
      (rd.selections?.[sem] || []).forEach(c => courseSet.add(c));
    });
    const columns = [...courseSet].sort((a, b) => a.localeCompare(b, "ko"));

    // 학생별 0/1 행 생성 (sid 오름차순)
    const rows = latest
      .slice()
      .sort((a, b) => String(a._id).localeCompare(String(b._id)))
      .map(rd => {
        const picked = new Set(rd.selections?.[sem] || []);
        return {
          sid: rd._id,
          name: nameOf[rd._id] || rd.name || "",
          values: columns.map(c => (picked.has(c) ? 1 : 0))
        };
      });

    result[sem] = { columns, rows };
  });

  // 4) CSV 다운로드 요청이면 CSV로 응답
  if (download) {
    let csv = "";
    semesters.forEach((sem, i) => {
      if (i > 0) csv += "\n\n";
      csv += `[${SEM_LABEL[sem]} 학기]\n`;
      const { columns, rows } = result[sem];
      // 헤더
      csv += ["학번", "이름", ...columns].map(cell).join(",") + "\n";
      // 본문
      rows.forEach(r => {
        csv += [r.sid, r.name, ...r.values].map(cell).join(",") + "\n";
      });
    });

    const fname = `sugang_matrix_${semester || "all"}_${Date.now()}.csv`;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${fname}"`);
    // 엑셀 한글 깨짐 방지용 BOM
    return res.status(200).send("\uFEFF" + csv);
  }

  // 5) 기본: JSON 미리보기
  return res.status(200).json({
    studentCount: latest.length,
    semesters: result
  });
}
