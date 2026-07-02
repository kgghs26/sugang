import { MongoClient } from "mongodb";
import jwt from "jsonwebtoken";

const client = new MongoClient(process.env.MONGODB_URI);

function verify(req){
  const auth = req.headers.authorization || "";
  return jwt.verify(auth.replace("Bearer ", ""), process.env.JWT_SECRET);
}

export default async function handler(req, res){
  // ===== CORS =====
  res.setHeader("Access-Control-Allow-Origin", "https://kgghs26.github.io");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  // ================

  if (req.method !== "POST" && req.method !== "GET")
    return res.status(405).json({ error: "Method not allowed" });

  let user;
  try { user = verify(req); }
  catch { return res.status(401).json({ error: "로그인이 필요합니다." }); }

  await client.connect();
  const col = client.db("sugang").collection("submissions");

  // ── GET: 본인 제출본 조회 (불러오기 모달) ──
  if (req.method === "GET") {
    const sub = await col.findOne({ sid: user.sid });
    if (!sub) return res.status(404).json({ error: "제출본이 없습니다." });
    return res.status(200).json(sub);
  }

  // ── POST: 제출 (최종본 덮어쓰기) ──

  const { selections, excluded, isComplete } = req.body;

  // 학번당 1건만 유지 (최종 제출본으로 덮어쓰기)
  await col.updateOne(
    { sid: user.sid },
    { $set: {
        sid: user.sid,
        name: user.name,
        cls: String(user.sid).slice(0, 3),   // 반 구분용 앞 3자리 (예: 11301 → 113)
        selections: selections || {},
        excluded: excluded || {},
        isComplete: !!isComplete,
        submittedAt: new Date()
    }},
    { upsert: true }
  );

  return res.status(200).json({ ok: true });
}
